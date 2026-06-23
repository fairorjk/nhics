import { HOLIDAYS_DB, getHolidayName, formatDate, getMondayOfWeek, getWeekOfYear, getMonday, getWeekNumByMonthAndWeek } from './holidays.js';
import { generateSchedule } from './scheduler.js';

// YYYY-MM-DD 형식의 문자열을 로컬 타임존 기준으로 안전하게 Date 객체로 파싱합니다.
function parseLocalDate(dateStr) {
    if (!dateStr) return new Date();
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    }
    return new Date(dateStr);
}

// --- 어플리케이션 상태 (State) ---
let state = {
    rooms: [
        { id: 'room-1', name: '400석 대형강의실', seats: 400 },
        { id: 'room-2', name: '250석 중형강의실', seats: 250 }
    ],
    courses: [],
    blockedWeeks: [],
    scheduleResult: null,
    currentView: 'gantt', // 'gantt' | 'calendar'
    calendarCurrentDate: new Date(2026, 2, 1), // 캘린더 기준 월 (3월)
    ganttScrollOffset: 0,
    year: 2026,
    currentPage: 1
};

// --- 초기 샘플 데이터 (5개 교육과정) ---
const SAMPLE_COURSES = [
    {
        id: 'c-1',
        name: 'AI 융합 소프트웨어 핵심 개발자 과정',
        capacity: 380,
        startRange: '2026-03-02',
        endRange: '2026-06-26',
        segments: [
            { type: 'face-to-face', duration: 4 },
            { type: 'online', duration: 6 },
            { type: 'face-to-face', duration: 2 }
        ]
    },
    {
        id: 'c-2',
        name: '클라우드 네이티브 아키텍처 실무',
        capacity: 220,
        startRange: '2026-03-02',
        endRange: '2026-06-19',
        segments: [
            { type: 'face-to-face', duration: 6 },
            { type: 'online', duration: 4 }
        ]
    },
    {
        id: 'c-3',
        name: '풀스택 자바스크립트 개발자 부트캠프',
        capacity: 240,
        startRange: '2026-04-06',
        endRange: '2026-08-28',
        segments: [
            { type: 'face-to-face', duration: 8 },
            { type: 'online', duration: 4 },
            { type: 'face-to-face', duration: 2 }
        ]
    },
    {
        id: 'c-4',
        name: '디바이스 드라이버 및 IoT 제어',
        capacity: 180,
        startRange: '2026-05-11',
        endRange: '2026-09-04',
        segments: [
            { type: 'online', duration: 4 },
            { type: 'face-to-face', duration: 6 }
        ]
    },
    {
        id: 'c-5',
        name: '생성형 AI 비즈니스 서비스 기획',
        capacity: 350,
        startRange: '2026-03-16',
        endRange: '2026-07-24',
        segments: [
            { type: 'face-to-face', duration: 3 },
            { type: 'online', duration: 6 },
            { type: 'face-to-face', duration: 3 }
        ]
    }
];

// --- DOM 요소 캐싱 ---
const dom = {
    roomList: document.getElementById('room-list'),
    courseList: document.getElementById('course-list'),
    courseCount: document.getElementById('course-count'),
    btnAutoSchedule: document.getElementById('btn-auto-schedule'),
    btnResetCourses: document.getElementById('btn-reset-courses'),
    btnAddRoom: document.getElementById('btn-add-room'),
    btnAddCourse: document.getElementById('btn-add-course'),
    selectYear: document.getElementById('select-year'),
    
    // Blocked Weeks (Forced Online)
    blockedWeeksList: document.getElementById('blocked-weeks-list'),
    btnAddBlockedWeek: document.getElementById('btn-add-blocked-week'),
    modalBlockedWeek: document.getElementById('modal-blocked-week'),
    formBlockedWeek: document.getElementById('form-blocked-week'),
    
    // Stats
    statScheduledCount: document.getElementById('stat-scheduled-count'),
    statRoomUtilization: document.getElementById('stat-room-utilization'),
    statConflictsCount: document.getElementById('stat-conflicts-count'),
    conflictAlertPanel: document.getElementById('conflict-alert-panel'),
    conflictList: document.getElementById('conflict-list'),
    
    // Views
    btnViewGantt: document.getElementById('btn-view-gantt'),
    btnViewCalendar: document.getElementById('btn-view-calendar'),
    ganttView: document.getElementById('gantt-view'),
    calendarView: document.getElementById('calendar-view'),
    btnTimelinePrev: document.getElementById('btn-timeline-prev'),
    btnTimelineNext: document.getElementById('btn-timeline-next'),
    timelineCurrentLabel: document.getElementById('timeline-current-label'),
    
    // Modals
    modalCourse: document.getElementById('modal-course'),
    formCourse: document.getElementById('form-course'),
    modalCourseTitle: document.getElementById('modal-course-title'),
    editCourseId: document.getElementById('edit-course-id'),
    courseAutoAdjust: document.getElementById('course-auto-adjust'),
    courseGroup: document.getElementById('course-group'),
    segmentsContainer: document.getElementById('segments-container'),
    btnAddSegment: document.getElementById('btn-add-segment'),
    totalDurationDisplay: document.getElementById('total-duration-display'),
    faceDurationDisplay: document.getElementById('face-duration-display'),
    onlineDurationDisplay: document.getElementById('online-duration-display'),
    cleanupDurationDisplay: document.getElementById('cleanup-duration-display'),
    btnSaveImage: document.getElementById('btn-save-image'),
    coursePagination: document.getElementById('course-pagination'),
    
    modalRoom: document.getElementById('modal-room'),
    formRoom: document.getElementById('form-room'),
    modalRoomTitle: document.getElementById('modal-room-title'),
    editRoomId: document.getElementById('edit-room-id'),
    
    // File Save/Load
    btnExportData: document.getElementById('btn-export-data'),
    btnImportData: document.getElementById('btn-import-data'),
    inputImportFile: document.getElementById('input-import-file')
};

// --- 로컬스토리지 저장 및 불러오기 ---
function saveToLocalStorage() {
    localStorage.setItem('eduschedule_rooms', JSON.stringify(state.rooms));
    localStorage.setItem('eduschedule_courses', JSON.stringify(state.courses));
    localStorage.setItem('eduschedule_year', state.year.toString());
    localStorage.setItem('eduschedule_blocked', JSON.stringify(state.blockedWeeks));
}

function loadFromLocalStorage() {
    const savedRooms = localStorage.getItem('eduschedule_rooms');
    const savedCourses = localStorage.getItem('eduschedule_courses');
    const savedYear = localStorage.getItem('eduschedule_year');
    const savedBlocked = localStorage.getItem('eduschedule_blocked');
    
    if (savedRooms) {
        state.rooms = JSON.parse(savedRooms);
    }
    
    if (savedCourses) {
        state.courses = JSON.parse(savedCourses);
    } else {
        state.courses = JSON.parse(JSON.stringify(SAMPLE_COURSES));
        localStorage.setItem('eduschedule_courses', JSON.stringify(state.courses));
    }
    
    if (savedYear) {
        state.year = parseInt(savedYear);
        const selectYearEl = document.getElementById('select-year');
        if (selectYearEl) {
            selectYearEl.value = state.year.toString();
        }
        state.calendarCurrentDate = new Date(state.year, 2, 1);
    } else {
        state.year = 2026;
    }

    if (savedBlocked) {
        state.blockedWeeks = JSON.parse(savedBlocked);
    } else {
        // 기본 권장 공통 온라인 주간: 8월 1주차 설정 (여름 휴가/정비 주간)
        const defaultWeekNum = getWeekNumByMonthAndWeek(state.year, 8, 1);
        state.blockedWeeks = [
            { id: 'bw-default', month: 8, week: 1, weekNum: defaultWeekNum, label: '8월 1주차' }
        ];
        localStorage.setItem('eduschedule_blocked', JSON.stringify(state.blockedWeeks));
    }
}

// --- 초기화 (Initialization) ---
window.addEventListener('DOMContentLoaded', () => {
    loadFromLocalStorage();
    initEventListeners();
    runScheduling();
    renderAll();
});

// --- 이벤트 리스너 등록 ---
function initEventListeners() {
    // 뷰 전환 버튼
    dom.btnViewGantt.addEventListener('click', () => switchView('gantt'));
    dom.btnViewCalendar.addEventListener('click', () => switchView('calendar'));
    
    // 간트 차트 영역 마우스 이탈 시 툴팁 숨기기
    if (dom.ganttView) {
        dom.ganttView.addEventListener('mouseleave', hideGanttTooltip);
    }
    
    // 타임라인 내비게이션
    dom.btnTimelinePrev.addEventListener('click', () => navigateTimeline(-1));
    dom.btnTimelineNext.addEventListener('click', () => navigateTimeline(1));
    
    // 스케줄 가동 버튼
    dom.btnAutoSchedule.addEventListener('click', () => {
        runScheduling();
        renderAll();
    });
    
    // 초기화 버튼
    dom.btnResetCourses.addEventListener('click', () => {
        if (confirm('모든 과정과 강의실 설정을 초기 샘플 데이터로 리셋하시겠습니까?')) {
            state.courses = JSON.parse(JSON.stringify(SAMPLE_COURSES));
            state.rooms = [
                { id: 'room-1', name: '400석 대형강의실', seats: 400 },
                { id: 'room-2', name: '250석 중형강의실', seats: 250 }
            ];
            state.year = 2026;
            const selectYearEl = document.getElementById('select-year');
            if (selectYearEl) selectYearEl.value = '2026';
            state.calendarCurrentDate = new Date(2026, 2, 1);
            saveToLocalStorage();
            runScheduling();
            renderAll();
        }
    });

    // 강의실 추가 버튼
    dom.btnAddRoom.addEventListener('click', () => openRoomModal());
    
    // 교육과정 추가 버튼
    dom.btnAddCourse.addEventListener('click', () => openCourseModal());
    
    // 대상 연도 변경 셀렉터
    dom.selectYear.addEventListener('change', handleYearChange);
    
    // 공통 온라인 주간 추가 버튼
    dom.btnAddBlockedWeek.addEventListener('click', () => {
        dom.modalBlockedWeek.classList.remove('hidden');
    });

    // 공통 온라인 주간 등록 폼 제출
    dom.formBlockedWeek.addEventListener('submit', handleBlockedWeekSubmit);
    
    // 모달 닫기 버튼들 공통 처리
    document.querySelectorAll('.btn-close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            dom.modalCourse.classList.add('hidden');
            dom.modalRoom.classList.add('hidden');
            dom.modalBlockedWeek.classList.add('hidden');
            hideGanttTooltip();
        });
    });

    // 세그먼트 생성 팝업 내 버튼
    dom.btnAddSegment.addEventListener('click', () => addSegmentRow());

    // 폼 서브밋 핸들러
    dom.formCourse.addEventListener('submit', handleCourseSubmit);
    dom.formRoom.addEventListener('submit', handleRoomSubmit);
    
    // 이미지 저장 버튼 핸들러
    dom.btnSaveImage.addEventListener('click', saveChartAsImage);

    // 파일 저장/불러오기 버튼 핸들러
    if (dom.btnExportData) {
        dom.btnExportData.addEventListener('click', exportDataToFile);
    }
    if (dom.btnImportData && dom.inputImportFile) {
        dom.btnImportData.addEventListener('click', () => dom.inputImportFile.click());
        dom.inputImportFile.addEventListener('change', importDataFromFile);
    }
}

// 대상 연도 변경 핸들러
function handleYearChange(e) {
    const newYear = parseInt(e.target.value);
    state.year = newYear;
    
    // 캘린더 월 기준도 선택한 연도의 3월 1일로 리셋
    state.calendarCurrentDate = new Date(newYear, 2, 1);
    
    // 기존 교육과정들의 startRange 및 endRange 연도를 새 연도로 변환
    state.courses.forEach(course => {
        course.startRange = course.startRange.replace(/^\d{4}/, newYear);
        course.endRange = course.endRange.replace(/^\d{4}/, newYear);
    });
    
    saveToLocalStorage();
    runScheduling();
    renderAll();
}

function runScheduling() {
    // 공통 온라인 주간의 weekNum 값을 현재 연도 기준으로 갱신
    state.blockedWeeks.forEach(bw => {
        bw.weekNum = getWeekNumByMonthAndWeek(state.year, bw.month, bw.week);
    });

    const blockedNums = state.blockedWeeks.map(bw => bw.weekNum);
    
    // JS 측에서 전처리 및 정렬 결과 로깅 준비
    const preprocessedCourses = state.courses.map(course => {
        let segments = course.segments || [];
        let faceWeeks = segments.filter(s => s.type === 'face-to-face').reduce((sum, s) => sum + parseInt(s.duration || 0), 0);
        let onlineWeeks = segments.filter(s => s.type === 'online').reduce((sum, s) => sum + parseInt(s.duration || 0), 0);
        let cleanupWeeks = segments.filter(s => s.type === 'cleanup').reduce((sum, s) => sum + parseInt(s.duration || 0), 0);
        const totalDuration = faceWeeks + onlineWeeks + cleanupWeeks;
        
        const startParts = (course.startRange || '').split('-');
        const startRangeDate = startParts.length === 3 
            ? new Date(parseInt(startParts[0]), parseInt(startParts[1]) - 1, parseInt(startParts[2]))
            : new Date();
        
        const endParts = (course.endRange || '').split('-');
        const endRangeDate = endParts.length === 3 
            ? new Date(parseInt(endParts[0]), parseInt(endParts[1]) - 1, parseInt(endParts[2]))
            : new Date();
        
        const startWeek = getWeekOfYear(startRangeDate);
        const endWeek = getWeekOfYear(endRangeDate);
        const windowSize = endWeek - startWeek - totalDuration;

        return {
            id: course.id,
            name: course.name,
            capacity: parseInt(course.capacity) || 0,
            startWeek,
            endWeek,
            windowSize,
            totalDuration
        };
    });

    // 정렬 수행
    preprocessedCourses.sort((a, b) => {
        if (b.capacity !== a.capacity) {
            return b.capacity - a.capacity;
        }
        if (a.windowSize !== b.windowSize) {
            return a.windowSize - b.windowSize;
        }
        return b.totalDuration - a.totalDuration;
    });

    console.log("=== JS Sorted Preprocessed Courses ===");
    preprocessedCourses.forEach((c, i) => {
        console.log(`  ${i+1}. ${c.name} (ID: ${c.id}, Cap: ${c.capacity}, WStart: ${c.startWeek}, WEnd: ${c.endWeek}, Window: ${c.windowSize}, Duration: ${c.totalDuration})`);
    });

    const result = generateSchedule(state.courses, state.rooms, state.year, blockedNums);
    state.scheduleResult = result;
    
    // Send state and results to server
    fetch('/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            courses: state.courses,
            rooms: state.rooms,
            blockedWeeks: state.blockedWeeks,
            year: state.year,
            jsPreprocessedSorted: preprocessedCourses, // 디버깅 상세 정렬 정보 추가
            result: {
                conflicts: result.conflicts,
                scheduledCount: result.scheduledCourses.filter(c => c.scheduled).length,
                totalCount: result.scheduledCourses.length,
                hitMaxSteps: result.hitMaxSteps,
                searchSteps: result.searchSteps
            }
        })
    }).catch(err => console.error("Logging error:", err));
    
    // 상태 동기화 (배정 결과 반영)
    result.scheduledCourses.forEach(sc => {
        const idx = state.courses.findIndex(c => c.id === sc.id);
        if (idx !== -1) {
            state.courses[idx].scheduled = sc.scheduled;
            state.courses[idx].scheduleSegments = sc.scheduleSegments;
            state.courses[idx].assignedRoomId = sc.assignedRoomId;
            state.courses[idx].startDate = sc.startDate;
            state.courses[idx].endDate = sc.endDate;
        }
    });
}

// --- 뷰 전환 ---
function switchView(view) {
    hideGanttTooltip();
    state.currentView = view;
    if (view === 'gantt') {
        dom.btnViewGantt.classList.add('active');
        dom.btnViewCalendar.classList.remove('active');
        dom.ganttView.classList.remove('hidden');
        dom.calendarView.classList.add('hidden');
        updateTimelineLabel();
    } else {
        dom.btnViewGantt.classList.remove('active');
        dom.btnViewCalendar.classList.add('active');
        dom.ganttView.classList.add('hidden');
        dom.calendarView.classList.remove('hidden');
        updateTimelineLabel();
        renderCalendar();
    }
}

// --- 타임라인 내비게이션 (Gantt 스크롤 또는 Calendar 월 변경) ---
function navigateTimeline(direction) {
    if (state.currentView === 'gantt') {
        if (dom.ganttView) {
            // 주차별 너비 약 45px * 10주 = 450px씩 이동
            dom.ganttView.scrollBy({ left: direction * 450, behavior: 'smooth' });
        }
    } else {
        // 달력 월 변경 (1달씩 가감)
        state.calendarCurrentDate.setMonth(state.calendarCurrentDate.getMonth() + direction);
        updateTimelineLabel();
        renderCalendar();
    }
}

function updateTimelineLabel() {
    if (state.currentView === 'gantt') {
        dom.timelineCurrentLabel.innerText = `${state.year}년 연간 스케줄 (52주)`;
    } else {
        const year = state.calendarCurrentDate.getFullYear();
        const month = state.calendarCurrentDate.getMonth() + 1;
        dom.timelineCurrentLabel.innerText = `${year}년 ${month}월`;
    }
}

// --- 전체 렌더링 컨트롤러 ---
function renderAll() {
    renderRooms();
    renderBlockedWeeks();
    renderCourseList();
    renderDashboardStats();
    renderGanttChart();
    renderCalendar();
    updateTimelineLabel();
}

// --- 대시보드 통계 업데이트 ---
function renderDashboardStats() {
    const total = state.courses.length;
    const scheduled = state.courses.filter(c => c.scheduled).length;
    
    dom.statScheduledCount.innerText = `${scheduled} / ${total} 개 과정`;
    
    // 평균 가동률 구하기
    if (state.scheduleResult && state.scheduleResult.roomUtilization) {
        let utilSum = 0;
        const roomIds = Object.keys(state.scheduleResult.roomUtilization);
        roomIds.forEach(id => {
            utilSum += state.scheduleResult.roomUtilization[id];
        });
        const avgUtil = roomIds.length > 0 ? Math.round(utilSum / roomIds.length) : 0;
        dom.statRoomUtilization.innerText = `${avgUtil}%`;
    } else {
        dom.statRoomUtilization.innerText = '0%';
    }
    
    // 충돌 건수 및 경고창 처리
    const conflicts = (state.scheduleResult && state.scheduleResult.conflicts) || [];
    dom.statConflictsCount.innerText = `${conflicts.length}건`;
    
    if (conflicts.length > 0) {
        dom.conflictAlertPanel.classList.remove('hidden');
        dom.conflictList.innerHTML = conflicts.map(c => `
            <li><strong>${escapeHtml(c.courseName)}</strong>: ${escapeHtml(c.reason)}</li>
        `).join('');
    } else {
        dom.conflictAlertPanel.classList.add('hidden');
    }
}

// --- 강의실 리스트 렌더링 ---
function renderRooms() {
    dom.roomList.innerHTML = state.rooms.map(room => {
        let util = 0;
        if (state.scheduleResult && state.scheduleResult.roomUtilization) {
            util = state.scheduleResult.roomUtilization[room.id] || 0;
        }
        return `
            <div class="room-item">
                <div class="room-info">
                    <span class="room-name">${escapeHtml(room.name)}</span>
                    <span class="room-capacity">${room.seats}석 (가동률 ${util}%)</span>
                </div>
                <div class="room-actions">
                    <button class="btn-icon" onclick="window.openRoomModal('${room.id}')" title="수정">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="btn-icon" onclick="window.deleteRoom('${room.id}')" title="삭제">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// 고유 그룹/과정 매핑을 생성하고 과정에 해당하는 Hue(0~360) 값을 반환하는 헬퍼
function getCourseHue(course) {
    const groups = [];
    state.courses.forEach(c => {
        if (c.group && c.group.trim()) {
            const g = c.group.trim();
            if (!groups.includes(g)) groups.push(g);
        } else {
            if (!groups.includes(c.id)) groups.push(c.id);
        }
    });

    const groupKey = (course.group && course.group.trim()) ? course.group.trim() : course.id;
    const groupIdx = groups.indexOf(groupKey);
    const totalGroups = Math.max(1, groups.length);
    return (groupIdx * (360 / totalGroups)) % 360;
}

// 대면/온라인 및 그룹별 고유 Hue 컬러 코드 스타일 정의
function getCourseColorStyle(course, isOnline) {
    const hue = getCourseHue(course);
    if (isOnline) {
        return `
            background: hsla(${hue}, 80%, 35%, 0.15) !important;
            border: 1px solid hsla(${hue}, 90%, 55%, 0.4) !important;
            box-shadow: 0 2px 6px hsla(${hue}, 80%, 25%, 0.05) !important;
            color: hsla(${hue}, 100%, 80%, 0.95) !important;
        `;
    } else {
        return `
            background: linear-gradient(135deg, hsl(${hue}, 70%, 42%) 0%, hsl(${hue}, 80%, 32%) 100%) !important;
            border: 1px solid hsla(${hue}, 100%, 65%, 0.4) !important;
            box-shadow: 0 4px 8px hsla(${hue}, 80%, 35%, 0.2) !important;
            color: #fff !important;
        `;
    }
}

// --- 교육과정 리스트 렌더링 (사이드바) ---
function renderCourseList() {
    dom.courseCount.innerText = `${state.courses.length} / 30개 과정`;
    
    // 페이지 범위 계산
    const itemsPerPage = 10;
    const totalPages = 3; // 항상 3페이지 고정 표시
    
    // 현재 페이지 안전 보정
    if (state.currentPage < 1) state.currentPage = 1;
    if (state.currentPage > totalPages) state.currentPage = totalPages;
    
    // 현재 페이지 코스만 필터링
    const pageCourses = state.courses.slice((state.currentPage - 1) * itemsPerPage, state.currentPage * itemsPerPage);
    
    if (pageCourses.length === 0) {
        dom.courseList.innerHTML = `<div class="empty-state" style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 13px;">이 페이지에 등록된 교육과정이 없습니다.</div>`;
    } else {
        dom.courseList.innerHTML = pageCourses.map(course => {
            const isScheduled = course.scheduled;
            const conflicts = (state.scheduleResult && state.scheduleResult.conflicts) || [];
            const hasConflict = conflicts.some(c => c.courseId === course.id);
            
            let statusClass = 'unscheduled';
            let statusText = '배정 대기';
            
            if (isScheduled) {
                statusClass = 'scheduled';
                const room = state.rooms.find(r => r.id === course.assignedRoomId);
                statusText = room ? `${room.name}(${room.seats}) 배정` : '배정 완료';
            } else if (hasConflict) {
                statusClass = 'conflict';
                statusText = '일정 충돌';
            }

            // 세그먼트 요약 주차 구하기
            const faceWeeks = course.segments.filter(s => s.type === 'face-to-face').reduce((s, seg) => s + seg.duration, 0);
            const onlineWeeks = course.segments.filter(s => s.type === 'online').reduce((s, seg) => s + seg.duration, 0);
            const cleanupWeeks = course.segments.filter(s => s.type === 'cleanup').reduce((s, seg) => s + seg.duration, 0);
            
            // 세그먼트 막대 프리뷰 HTML 생성
            const totalW = faceWeeks + onlineWeeks + cleanupWeeks;
            const segmentBarHTML = course.segments.map(seg => {
                const widthPct = (seg.duration / totalW) * 100;
                const isOnline = seg.type === 'online';
                const isCleanup = seg.type === 'cleanup';
                
                let style = '';
                if (isCleanup) {
                    style = `background: rgba(255, 255, 255, 0.15) !important; border: 1px dashed rgba(255, 255, 255, 0.2) !important;`;
                } else {
                    style = getCourseColorStyle(course, isOnline);
                }
                const title = seg.type === 'face-to-face' ? `대면 ${seg.duration}주` : (seg.type === 'online' ? `온라인 ${seg.duration}주` : `정리기간 ${seg.duration}주`);
                return `<div class="segment-bar" style="width: ${widthPct}%; ${style}" title="${title}"></div>`;
            }).join('');

            let adjustBadgeHTML = '';
            if (isScheduled && course.sequenceAdjusted) {
                adjustBadgeHTML = `
                    <div class="sequence-adjusted-badge" style="font-size: 11px; color: var(--secondary); font-weight: 600; margin-top: 4px; display: flex; align-items: center; gap: 4px;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                        <span>순서 자동 조정됨: ${escapeHtml(course.adjustedText)}</span>
                    </div>
                `;
            }

            const groupBadgeHTML = course.group ? `<span class="meta-badge badge-group" title="동시 운영 제한 그룹: ${escapeHtml(course.group)}">${escapeHtml(course.group)}</span>` : '';

            // 세부 교육 세그먼트 단계 생성
            const segmentStepsHTML = course.segments.map((seg, idx) => {
                const typeLabel = seg.type === 'face-to-face' ? '대면' : (seg.type === 'online' ? '온라인' : '정리');
                const isOnline = seg.type === 'online';
                const isCleanup = seg.type === 'cleanup';
                const hue = getCourseHue(course);
                
                let style = '';
                if (isCleanup) {
                    style = `background: rgba(255, 255, 255, 0.02) !important; color: var(--text-muted) !important; border: 1px dashed rgba(255, 255, 255, 0.15) !important; border-left: 3px solid rgba(255, 255, 255, 0.25) !important;`;
                } else if (isOnline) {
                    style = `background: hsla(${hue}, 80%, 35%, 0.15) !important; color: hsla(${hue}, 100%, 80%, 0.95) !important; border: 1px solid hsla(${hue}, 90%, 55%, 0.4) !important; border-left: 3px solid hsla(${hue}, 90%, 55%, 0.8) !important;`;
                } else {
                    style = `background: hsla(${hue}, 80%, 35%, 0.4) !important; color: #fff !important; border: 1px solid hsla(${hue}, 100%, 65%, 0.4) !important; border-left: 3px solid hsl(${hue}, 100%, 65%) !important;`;
                }
                return `
                    <span class="segment-step" style="${style}">
                        ${typeLabel} ${seg.duration}주
                    </span>
                `;
            }).join('<span class="segment-step-arrow">→</span>');

            // 상세 설명 섹션 구성
            const room = state.rooms.find(r => r.id === course.assignedRoomId);
            const roomNameStr = isScheduled ? (room ? room.name : '강의실 불필요') : '배정 대기';
            
            const preferredRoom = course.preferredRoomId ? state.rooms.find(r => r.id === course.preferredRoomId) : null;
            const preferredRoomStr = preferredRoom ? preferredRoom.name : '없음';

            const detailsHTML = `
                <div class="course-card-details">
                    <div class="course-detail-row">
                        <span class="label">희망 기한:</span>
                        <span class="value">${course.startRange} ~ ${course.endRange}</span>
                    </div>
                    <div class="course-detail-row">
                        <span class="label">선호 교실:</span>
                        <span class="value">${escapeHtml(preferredRoomStr)}</span>
                    </div>
                    <div class="course-detail-row">
                        <span class="label">자동 조정:</span>
                        <span class="value">${course.autoAdjustSequence !== false ? '허용' : '비허용'}</span>
                    </div>
                    <div class="course-segment-steps">
                        ${segmentStepsHTML}
                    </div>
                </div>
            `;

            return  `
                <div class="course-card ${statusClass}" draggable="true" data-id="${course.id}">
                    <div class="course-card-top">
                        <h3 class="course-card-title">${escapeHtml(course.name)}</h3>
                        <div class="room-actions">
                            <button class="btn-icon" onclick="window.openCourseModal('${course.id}')" title="편집">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                            <button class="btn-icon" onclick="window.deleteCourse('${course.id}')" title="삭제">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            </button>
                        </div>
                    </div>
                    <div class="course-card-meta">
                        <span class="meta-badge badge-capacity">${course.capacity}명</span>
                        ${groupBadgeHTML}
                        <span class="meta-badge">대면 ${faceWeeks}주 / 온라인 ${onlineWeeks}주${cleanupWeeks > 0 ? ` / 정리 ${cleanupWeeks}주` : ''}</span>
                    </div>
                    <div class="course-card-meta" style="margin-top: 4px; justify-content: space-between; align-items: center;">
                        <span class="course-status-badge status-${statusClass}">${statusText}</span>
                        ${isScheduled ? `<span style="font-size: 10px; font-family: var(--font-mono); color: var(--text-muted);">${course.startDate} - ${course.endDate}</span>` : ''}
                    </div>
                    ${detailsHTML}
                    ${adjustBadgeHTML}
                </div>
            `;
        }).join('');
    }

    // 페이지네이션 버튼 렌더링
    let paginationHTML = '';
    for (let p = 1; p <= totalPages; p++) {
        const activeClass = state.currentPage === p ? 'active' : '';
        paginationHTML += `<button type="button" class="btn-pagination ${activeClass}" onclick="window.changeCoursePage(${p})">${p}</button>`;
    }
    dom.coursePagination.innerHTML = paginationHTML;
    setupCourseDragAndDrop();
}

// 교육과정 드래그 앤 드롭 재정렬 핸들러
function setupCourseDragAndDrop() {
    const cards = dom.courseList.querySelectorAll('.course-card');
    
    cards.forEach(card => {
        card.addEventListener('dragstart', (e) => {
            const courseId = card.getAttribute('data-id');
            e.dataTransfer.setData('text/plain', courseId);
            card.classList.add('dragging');
        });
        
        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
            cards.forEach(c => c.classList.remove('drag-over'));
        });
        
        card.addEventListener('dragover', (e) => {
            e.preventDefault();
        });
        
        card.addEventListener('dragenter', (e) => {
            e.preventDefault();
            if (!card.classList.contains('dragging')) {
                card.classList.add('drag-over');
            }
        });
        
        card.addEventListener('dragleave', () => {
            card.classList.remove('drag-over');
        });
        
        card.addEventListener('drop', (e) => {
            e.preventDefault();
            card.classList.remove('drag-over');
            
            const draggedId = e.dataTransfer.getData('text/plain');
            const targetId = card.getAttribute('data-id');
            
            if (draggedId && targetId && draggedId !== targetId) {
                const draggedIdx = state.courses.findIndex(c => c.id === draggedId);
                const targetIdx = state.courses.findIndex(c => c.id === targetId);
                
                if (draggedIdx !== -1 && targetIdx !== -1) {
                    const [draggedCourse] = state.courses.splice(draggedIdx, 1);
                    state.courses.splice(targetIdx, 0, draggedCourse);
                    
                    saveToLocalStorage();
                    runScheduling();
                    renderAll();
                }
            }
        });
    });
}

// 온라인 교육 세그먼트들의 동시성 분석 및 개별 트랙(채널) 배정
function getOnlineTracks() {
    const onlineSegments = [];
    state.courses.forEach(course => {
        if (!course.scheduled || !course.scheduleSegments) return;
        course.scheduleSegments.forEach(seg => {
            if (seg.type === 'online') {
                onlineSegments.push({
                    courseId: course.id,
                    courseName: course.name,
                    capacity: course.capacity,
                    group: course.group,
                    startWeek: seg.startWeek,
                    endWeek: seg.endWeek,
                    duration: seg.duration,
                    startDate: seg.startDate,
                    endDate: seg.endDate
                });
            }
        });
    });
    
    // 시작 주차 기준 정렬
    onlineSegments.sort((a, b) => a.startWeek - b.startWeek);
    
    const tracks = []; // 각 트랙별 속한 세그먼트 목록
    onlineSegments.forEach(seg => {
        let assignedTrack = -1;
        for (let t = 0; t < tracks.length; t++) {
            // 해당 트랙에 겹치는 일정이 없는지 검사
            const hasOverlap = tracks[t].some(existing => {
                return !(seg.endWeek < existing.startWeek || seg.startWeek > existing.endWeek);
            });
            if (!hasOverlap) {
                assignedTrack = t;
                tracks[t].push(seg);
                break;
            }
        }
        if (assignedTrack === -1) {
            tracks.push([seg]);
            assignedTrack = tracks.length - 1;
        }
        seg.track = assignedTrack;
    });
    
    return {
        segments: onlineSegments,
        trackCount: Math.max(1, tracks.length)
    };
}

// --- 간트 차트 렌더링 ---
const WEEK_COL_WIDTH = 45; // 1주차당 컬럼 가로픽셀
function renderGanttChart() {
    const container = dom.ganttView;
    container.innerHTML = '';

    // 온라인 세그먼트 트랙 연산 및 높이 도출
    const { segments: onlineSegs, trackCount } = getOnlineTracks();
    const onlineRowHeight = trackCount * 38 + 16; // 1트랙당 38px + 상하패딩 16px

    // 상반기 (W1 ~ W26) 렌더링
    const firstHalfHTML = generateGanttHalfHTML(1, 26, onlineSegs, onlineRowHeight);
    // 하반기 (W27 ~ W52) 렌더링
    const secondHalfHTML = generateGanttHalfHTML(27, 52, onlineSegs, onlineRowHeight);

    container.innerHTML = `
        <div class="gantt-panel">
            <div class="gantt-panel-title">
                <span class="gantt-panel-badge first-half">상반기</span>
                <span class="gantt-panel-text">1월 ~ 6월 (W1 ~ W26)</span>
            </div>
            ${firstHalfHTML}
        </div>
        <div class="gantt-panel">
            <div class="gantt-panel-title">
                <span class="gantt-panel-badge second-half">하반기</span>
                <span class="gantt-panel-text">7월 ~ 12월 (W27 ~ W52)</span>
            </div>
            ${secondHalfHTML}
        </div>
    `;

    // 마우스 호버 연결 효과 바인딩 (강의실 대면 블록 <-> 온라인 블록 연계 강조)
    setupGanttHoverHighlight();
}

// 지정된 주차 범위(startW~endW)에 따른 간트 그리드 HTML 생성
function generateGanttHalfHTML(startW, endW, onlineSegs, onlineRowHeight) {
    const numWeeks = endW - startW + 1;
    let headerCellsHTML = '';
    let gridLinesHTML = '';
    
    for (let w = startW; w <= endW; w++) {
        const monDate = getMondayOfWeek(w, state.year);
        const monthName = monDate.toLocaleString('ko-KR', { month: 'short' });
        const isMonthStart = monDate.getDate() <= 7;
        const isWeekBlocked = state.blockedWeeks.some(bw => bw.weekNum === w);
        
        const mm = String(monDate.getMonth() + 1).padStart(2, '0');
        const dd = String(monDate.getDate()).padStart(2, '0');
        const dateStr = `${mm}-${dd}`;
        
        headerCellsHTML += `
            <div class="gantt-x-header-cell ${isMonthStart ? 'month-boundary' : ''} ${isWeekBlocked ? 'blocked-week' : ''}" style="width: ${WEEK_COL_WIDTH}px;" ${isWeekBlocked ? 'title="공통 온라인 주간 (강의실 사용불가)"' : ''}>
                ${isMonthStart ? `<span class="gantt-x-header-month">${monthName}</span>` : ''}
                <span class="gantt-x-header-week">W${w}</span>
                <span class="gantt-x-header-date">${dateStr}</span>
            </div>
        `;

        gridLinesHTML += `
            <div class="gantt-grid-line ${isMonthStart ? 'month-boundary' : ''} ${isWeekBlocked ? 'blocked-week' : ''}" style="width: ${WEEK_COL_WIDTH}px;"></div>
        `;
    }

    // Y축 헤더 (강의실 목록) 생성
    let yHeaderHTML = `
        <div class="gantt-y-header-cell">자원 / 주차</div>
    `;
    
    state.rooms.forEach(room => {
        yHeaderHTML += `
            <div class="gantt-row-label">
                <span class="gantt-row-title">${escapeHtml(room.name)}</span>
                <span class="gantt-row-subtitle">${room.seats}석</span>
            </div>
        `;
    });
    
    // 온라인 행 추가 (동적 높이 적용)
    yHeaderHTML += `
        <div class="gantt-row-label" style="background: linear-gradient(rgba(8, 145, 178, 0.05), rgba(8, 145, 178, 0.05)), #0f172a; height: ${onlineRowHeight}px; transition: height var(--transition-fast); justify-content: flex-start; padding-top: 10px;">
            <span class="gantt-row-title" style="color: var(--secondary);">온라인 교육</span>
            <span class="gantt-row-subtitle">강의실 불필요</span>
        </div>
    `;

    // 행 콘텐츠 영역 및 그리드 생성
    let rowsContentHTML = '';
    
    // 각 강의실 행 콘텐츠 생성
    state.rooms.forEach(room => {
        rowsContentHTML += `
            <div class="gantt-row-content" data-room-id="${room.id}">
                <div class="gantt-grid-lines">${gridLinesHTML}</div>
                <!-- 배정된 블록들이 삽입됨 -->
                ${renderGanttBlocksForRoom(room.id, startW, endW)}
            </div>
        `;
    });

    // 온라인 행 콘텐츠 생성 (동적 높이 및 계산된 온라인 세그먼트들 전달)
    rowsContentHTML += `
        <div class="gantt-row-content" data-online-row="true" style="background: rgba(8, 145, 178, 0.02); height: ${onlineRowHeight}px; transition: height var(--transition-fast);">
            <div class="gantt-grid-lines">${gridLinesHTML}</div>
            ${renderGanttOnlineBlocks(onlineSegs, startW, endW)}
        </div>
    `;

    return `
        <div class="gantt-grid">
            <div class="gantt-y-header">${yHeaderHTML}</div>
            <div class="gantt-x-scrollable">
                <div class="gantt-x-header" style="width: ${numWeeks * WEEK_COL_WIDTH}px;">
                    ${headerCellsHTML}
                </div>
                <div class="gantt-rows-container" style="width: ${numWeeks * WEEK_COL_WIDTH}px;">
                    ${rowsContentHTML}
                </div>
            </div>
        </div>
    `;
}

// 특정 강의실의 대면 세그먼트 블록들을 지정된 주차 범위에 맞춰 렌더링
function renderGanttBlocksForRoom(roomId, startW, endW) {
    let blocksHTML = '';
    
    state.courses.forEach(course => {
        if (!course.scheduled || !course.scheduleSegments) return;
        
        course.scheduleSegments.forEach((seg, segIdx) => {
            if (seg.type === 'face-to-face' && seg.roomId === roomId) {
                const segStart = seg.startWeek;
                const segEnd = seg.startWeek + seg.duration - 1;
                const overlapStart = Math.max(segStart, startW);
                const overlapEnd = Math.min(segEnd, endW);
                
                if (overlapStart <= overlapEnd) {
                    const overlapDuration = overlapEnd - overlapStart + 1;
                    const left = (overlapStart - startW) * WEEK_COL_WIDTH;
                    const width = overlapDuration * WEEK_COL_WIDTH - 2; // 여백 2px
                    const style = getCourseColorStyle(course, false);
                    
                    blocksHTML += `
                        <div class="gantt-block gantt-block-face" 
                             style="left: ${left}px; width: ${width}px; ${style}" 
                             data-course-id="${course.id}"
                             data-tooltip-content='${JSON.stringify({
                                 name: course.name,
                                 capacity: course.capacity,
                                 segType: '대면 교육',
                                 duration: seg.duration,
                                 start: seg.startDate,
                                 end: seg.endDate,
                                 roomName: state.rooms.find(r => r.id === roomId)?.name
                             })}'>
                            <div class="gantt-block-content">
                                <span class="gantt-block-title">${escapeHtml(course.name)}</span>
                                <span class="gantt-block-dates">${seg.startDate.substring(5)}~${seg.endDate.substring(5)}</span>
                            </div>
                        </div>
                    `;
                }
            }
        });
    });
    
    return blocksHTML;
}

// 온라인 세그먼트 블록들을 지정된 주차 범위에 맞춰 렌더링
function renderGanttOnlineBlocks(onlineSegs, startW, endW) {
    let blocksHTML = '';
    
    onlineSegs.forEach(seg => {
        const segStart = seg.startWeek;
        const segEnd = seg.startWeek + seg.duration - 1;
        const overlapStart = Math.max(segStart, startW);
        const overlapEnd = Math.min(segEnd, endW);
        
        if (overlapStart <= overlapEnd) {
            const overlapDuration = overlapEnd - overlapStart + 1;
            const left = (overlapStart - startW) * WEEK_COL_WIDTH;
            const width = overlapDuration * WEEK_COL_WIDTH - 2;
            const top = seg.track * 38 + 8; // 트랙 높이 38px + 여백 8px
            const course = state.courses.find(c => c.id === seg.courseId);
            const style = course ? getCourseColorStyle(course, true) : '';
            
            blocksHTML += `
                <div class="gantt-block gantt-block-online" 
                     style="left: ${left}px; width: ${width}px; top: ${top}px; height: 30px; ${style}" 
                     data-course-id="${seg.courseId}"
                     data-tooltip-content='${JSON.stringify({
                         name: seg.courseName,
                         capacity: seg.capacity,
                         group: seg.group,
                         segType: '온라인 원격 교육',
                         duration: seg.duration,
                         start: seg.startDate,
                         end: seg.endDate,
                         roomName: '온라인 진행 (강의실 미배정)'
                     })}'>
                    <div class="gantt-block-content" style="line-height: 1.15;">
                        <span class="gantt-block-title" style="font-size: 11px;">${escapeHtml(seg.courseName)}</span>
                        <span class="gantt-block-dates" style="font-size: 8px; opacity: 0.85;">${seg.startDate.substring(5)}~${seg.endDate.substring(5)}</span>
                    </div>
                </div>
            `;
        }
    });
    
    return blocksHTML;
}

// 간트 차트 툴팁 숨기기 헬퍼
function hideGanttTooltip() {
    const tooltip = document.getElementById('gantt-tooltip-el');
    if (tooltip) {
        tooltip.classList.add('hidden');
    }
}

// 툴팁 팝업 핸들러 및 마우스 동적 효과 설정
function setupGanttHoverHighlight() {
    const blocks = document.querySelectorAll('.gantt-block, .calendar-event');
    
    // 툴팁 엘리먼트 동적 생성
    let tooltip = document.getElementById('gantt-tooltip-el');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'gantt-tooltip-el';
        tooltip.className = 'gantt-tooltip hidden';
        document.body.appendChild(tooltip);
    }
    
    blocks.forEach(block => {
        if (block.dataset.hasHoverListener === 'true') return;
        block.dataset.hasHoverListener = 'true';
        
        // 호버 시 같은 코스의 다른 세그먼트 블록도 함께 발광(Highlight)하는 연출
        block.addEventListener('mouseenter', (e) => {
            const courseId = block.getAttribute('data-course-id');
            document.querySelectorAll(`.gantt-block[data-course-id="${courseId}"], .calendar-event[data-course-id="${courseId}"]`).forEach(el => {
                el.style.filter = 'brightness(1.25)';
                el.style.transform = 'scaleY(1.05) translateY(-2px)';
                el.style.boxShadow = '0 0 15px rgba(255, 255, 255, 0.4)';
            });

            // 툴팁 데이터 표시
            const data = JSON.parse(block.getAttribute('data-tooltip-content'));
            const isStartShifted = parseLocalDate(data.start).getDay() === 2; // 화요일 시작인 경우 공휴일로 인한 시프트
            
            tooltip.innerHTML = `
                <div class="tooltip-title">${escapeHtml(data.name)}</div>
                <div class="tooltip-row"><span class="tooltip-label">구분:</span><span class="tooltip-val" style="color: ${data.segType.includes('대면') ? 'var(--primary-hover)' : 'var(--secondary)'}">${data.segType}</span></div>
                ${data.group ? `<div class="tooltip-row"><span class="tooltip-label">그룹:</span><span class="tooltip-val" style="color: #c084fc; font-weight: 600;">${escapeHtml(data.group)}</span></div>` : ''}
                <div class="tooltip-row"><span class="tooltip-label">기간:</span><span class="tooltip-val">${data.duration}주 (총 ${data.duration * 5}일)</span></div>
                <div class="tooltip-row"><span class="tooltip-label">배정 교실:</span><span class="tooltip-val">${escapeHtml(data.roomName)}</span></div>
                <div class="tooltip-row"><span class="tooltip-label">일정:</span><span class="tooltip-val">${data.start} ~ ${data.end}</span></div>
                <div class="tooltip-row"><span class="tooltip-label">교육 인원:</span><span class="tooltip-val">${data.capacity}명</span></div>
                ${isStartShifted ? `<div class="tooltip-row" style="color:var(--danger); margin-top:4px; font-size:10px;"><span class="tooltip-label">알림:</span><span class="tooltip-val">월요일 공휴일로 화요일 시작</span></div>` : ''}
            `;
            tooltip.classList.remove('hidden');
        });
        
        block.addEventListener('mousemove', (e) => {
            tooltip.style.left = (e.pageX + 15) + 'px';
            tooltip.style.top = (e.pageY + 15) + 'px';
        });
        
        block.addEventListener('mouseleave', () => {
            const courseId = block.getAttribute('data-course-id');
            document.querySelectorAll(`.gantt-block[data-course-id="${courseId}"], .calendar-event[data-course-id="${courseId}"]`).forEach(el => {
                el.style.filter = '';
                el.style.transform = '';
                el.style.boxShadow = '';
            });
            tooltip.classList.add('hidden');
        });

        // 블록 클릭 시 해당 과정 바로 수정 모달 띄우기
        block.addEventListener('click', () => {
            const courseId = block.getAttribute('data-course-id');
            openCourseModal(courseId);
        });
    });
}

// --- 월별 캘린더 뷰 렌더링 ---
function renderCalendar() {
    const viewContainer = dom.calendarView;
    viewContainer.innerHTML = '';
    
    const baseDate = new Date(state.calendarCurrentDate);
    const year = baseDate.getFullYear();
    const month = baseDate.getMonth();
    
    // 해당 월의 첫 날과 마지막 날 계산
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // 달력 시작 셀 구하기 (첫 주의 일요일부터 렌더링)
    const startDayOfWeek = firstDay.getDay(); // 0: 일요일, 1: 월요일...
    const calendarStart = new Date(firstDay);
    calendarStart.setDate(firstDay.getDate() - startDayOfWeek);
    
    // 달력 캘린더 그리드 헤더 생성
    const daysHeader = ['일', '월', '화', '수', '목', '금', '토'];
    let gridHTML = daysHeader.map(d => `<div class="calendar-day-header">${d}</div>`).join('');
    
    // 총 6주(42일) 범위 반복 렌더링
    const currentIterDate = new Date(calendarStart);
    for (let i = 0; i < 42; i++) {
        const isOtherMonth = currentIterDate.getMonth() !== month;
        const dateStr = formatDate(currentIterDate);
        const holidayName = getHolidayName(currentIterDate);
        const isToday = formatDate(new Date()) === dateStr;
        
        // 해당 일자에 진행중인 일정(세그먼트) 검색
        const events = getCalendarEventsForDate(currentIterDate);
        
        let eventsHTML = events.map(ev => {
            const isOnline = ev.type === 'online';
            const style = getCourseColorStyle(ev.course, isOnline);
            const label = ev.type === 'face-to-face' ? `[대면] ${ev.courseName}` : `[원격] ${ev.courseName}`;
            
            // 현재 날짜에 해당하는 세그먼트 상세 정보 찾기
            const targetTime = currentIterDate.getTime();
            const seg = ev.course.scheduleSegments.find(s => {
                const start = parseLocalDate(s.startDate).getTime();
                const end = parseLocalDate(s.endDate).getTime();
                return targetTime >= start && targetTime <= end;
            });
            
            const tooltipData = {
                name: ev.course.name,
                capacity: ev.course.capacity,
                group: ev.course.group || '',
                segType: ev.type === 'face-to-face' ? '대면 교육' : '온라인 원격 교육',
                duration: seg ? seg.duration : 0,
                start: seg ? seg.startDate : '',
                end: seg ? seg.endDate : '',
                roomName: ev.type === 'face-to-face' ? ev.roomName : '온라인 진행 (강의실 미배정)'
            };
            
            return `<div class="calendar-event" 
                         style="${style}" 
                         data-course-id="${ev.course.id}"
                         data-tooltip-content='${JSON.stringify(tooltipData)}'>
                        ${escapeHtml(label)}
                    </div>`;
        }).join('');

        gridHTML += `
            <div class="calendar-day ${isOtherMonth ? 'other-month' : ''} ${holidayName ? 'holiday' : ''} ${isToday ? 'today' : ''}">
                <div class="calendar-day-number">${currentIterDate.getDate()}</div>
                ${holidayName ? `<div class="calendar-holiday-name">${holidayName}</div>` : ''}
                <div class="calendar-events">
                    ${eventsHTML}
                </div>
            </div>
        `;
        
        currentIterDate.setDate(currentIterDate.getDate() + 1);
    }
    
    viewContainer.innerHTML = `<div class="calendar-grid">${gridHTML}</div>`;
    setupGanttHoverHighlight();
}

// 특정 날짜에 진행 중인 대면/온라인 교육 과정 목록 수집
function getCalendarEventsForDate(date) {
    const events = [];
    const targetTime = date.getTime();
    
    state.courses.forEach(course => {
        if (!course.scheduled || !course.scheduleSegments) return;
        
        course.scheduleSegments.forEach(seg => {
            if (seg.type !== 'face-to-face' && seg.type !== 'online') return;
            const start = parseLocalDate(seg.startDate).getTime();
            const end = parseLocalDate(seg.endDate).getTime();
            
            // 타겟 날짜가 해당 세그먼트 시작일~종료일 범위에 속하는지 체크
            if (targetTime >= start && targetTime <= end) {
                const room = state.rooms.find(r => r.id === seg.roomId);
                events.push({
                    courseName: course.name,
                    type: seg.type,
                    roomName: room ? room.name : '온라인',
                    course: course
                });
            }
        });
    });
    
    return events;
}

// --- 강의실 설정 관리 (추가, 수정, 삭제) ---
window.openRoomModal = function(roomId = null) {
    dom.modalRoom.classList.remove('hidden');
    
    if (roomId) {
        const room = state.rooms.find(r => r.id === roomId);
        if (room) {
            dom.modalRoomTitle.innerText = '강의실 정보 수정';
            dom.editRoomId.value = room.id;
            document.getElementById('room-name').value = room.name;
            document.getElementById('room-seats').value = room.seats;
        }
    } else {
        dom.modalRoomTitle.innerText = '신규 강의실 등록';
        dom.editRoomId.value = '';
        dom.formRoom.reset();
    }
};

function handleRoomSubmit(e) {
    e.preventDefault();
    const id = dom.editRoomId.value;
    const name = document.getElementById('room-name').value.trim();
    const seats = parseInt(document.getElementById('room-seats').value);
    
    if (id) {
        // 수정
        const room = state.rooms.find(r => r.id === id);
        if (room) {
            room.name = name;
            room.seats = seats;
        }
    } else {
        // 추가
        const newId = `room-${Date.now()}`;
        state.rooms.push({ id: newId, name, seats });
    }
    
    dom.modalRoom.classList.add('hidden');
    saveToLocalStorage();
    runScheduling();
    renderAll();
}

window.deleteRoom = function(roomId) {
    if (state.rooms.length <= 1) {
        alert('최소 1개 이상의 강의실 설정이 필요합니다.');
        return;
    }
    if (confirm('강의실을 삭제하시겠습니까? 해당 강의실에 편성되었던 일정들은 자동 재조정됩니다.')) {
        state.rooms = state.rooms.filter(r => r.id !== roomId);
        saveToLocalStorage();
        runScheduling();
        renderAll();
    }
};

// --- 교육과정 설정 관리 (추가, 수정, 삭제) ---
window.openCourseModal = function(courseId = null) {
    hideGanttTooltip();
    dom.modalCourse.classList.remove('hidden');
    dom.segmentsContainer.innerHTML = '';
    
    // 선호 강의실 select box 동적 채우기
    const prefSelect = document.getElementById('course-preferred-room');
    if (prefSelect) {
        prefSelect.innerHTML = '<option value="">선호 시설 없음</option>';
        state.rooms.forEach(r => {
            const opt = document.createElement('option');
            opt.value = r.id;
            opt.textContent = `${r.name} (${r.seats}석)`;
            prefSelect.appendChild(opt);
        });
    }

    if (courseId) {
        const course = state.courses.find(c => c.id === courseId);
        if (course) {
            dom.modalCourseTitle.innerText = '교육과정 정보 수정';
            dom.editCourseId.value = course.id;
            document.getElementById('course-name').value = course.name;
            document.getElementById('course-capacity').value = course.capacity;
            dom.courseGroup.value = course.group || '';
            document.getElementById('course-start-range').value = course.startRange;
            document.getElementById('course-end-range').value = course.endRange;
            dom.courseAutoAdjust.checked = course.autoAdjustSequence !== false;
            if (prefSelect) {
                prefSelect.value = course.preferredRoomId || '';
            }
            
            // 세그먼트 로딩
            course.segments.forEach(seg => {
                addSegmentRow(seg.type, seg.duration);
            });
        }
    } else {
        if (state.courses.length >= 30) {
            alert('교육과정은 최대 30개까지만 운영할 수 있습니다.');
            dom.modalCourse.classList.add('hidden');
            return;
        }
        dom.modalCourseTitle.innerText = '신규 교육과정 등록';
        dom.editCourseId.value = '';
        dom.formCourse.reset();
        dom.courseAutoAdjust.checked = true;
        dom.courseGroup.value = '';
        if (prefSelect) {
            prefSelect.value = '';
        }
        
        // 디폴트 일정을 선택한 대상 연도 기준으로 맞춰 등록
        document.getElementById('course-start-range').value = `${state.year}-03-02`;
        document.getElementById('course-end-range').value = `${state.year}-11-27`;
        
        // 디폴트 세그먼트 2개 추가 (대면 4주, 온라인 4주)
        addSegmentRow('face-to-face', 4);
        addSegmentRow('online', 4);
    }
    
    calculateDurationSummary();
};

function addSegmentRow(type = 'face-to-face', duration = 2) {
    const row = document.createElement('div');
    row.className = 'segment-item';
    row.innerHTML = `
        <div class="segment-order-btns">
            <button type="button" class="btn-icon btn-move-up" title="위로 이동">▲</button>
            <button type="button" class="btn-icon btn-move-down" title="아래로 이동">▼</button>
        </div>
        <select class="seg-type-select">
            <option value="face-to-face" ${type === 'face-to-face' ? 'selected' : ''}>대면 (강의실 필요)</option>
            <option value="online" ${type === 'online' ? 'selected' : ''}>온라인 (강의실 미점유)</option>
            <option value="cleanup" ${type === 'cleanup' ? 'selected' : ''}>정리기간 (차트 미표시, 그룹 점유)</option>
        </select>
        <input type="number" class="seg-duration-input" required min="1" max="24" value="${duration}">
        <button type="button" class="btn-icon btn-delete-segment" title="세그먼트 제거">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
    `;
    
    // 리스너 바인딩
    row.querySelector('.btn-delete-segment').addEventListener('click', () => {
        row.remove();
        calculateDurationSummary();
    });
    
    row.querySelector('.btn-move-up').addEventListener('click', () => {
        const prev = row.previousElementSibling;
        if (prev) {
            row.parentNode.insertBefore(row, prev);
            calculateDurationSummary();
        }
    });

    row.querySelector('.btn-move-down').addEventListener('click', () => {
        const next = row.nextElementSibling;
        if (next) {
            row.parentNode.insertBefore(next, row);
            calculateDurationSummary();
        }
    });
    
    row.querySelector('.seg-type-select').addEventListener('change', calculateDurationSummary);
    row.querySelector('.seg-duration-input').addEventListener('input', calculateDurationSummary);
    
    dom.segmentsContainer.appendChild(row);
    calculateDurationSummary();
}

function calculateDurationSummary() {
    let total = 0;
    let face = 0;
    let online = 0;
    let cleanup = 0;
    
    const rows = dom.segmentsContainer.querySelectorAll('.segment-item');
    rows.forEach(row => {
        const type = row.querySelector('.seg-type-select').value;
        const duration = parseInt(row.querySelector('.seg-duration-input').value) || 0;
        
        total += duration;
        if (type === 'face-to-face') {
            face += duration;
        } else if (type === 'online') {
            online += duration;
        } else if (type === 'cleanup') {
            cleanup += duration;
        }
    });
    
    dom.totalDurationDisplay.innerText = `${total}주`;
    dom.faceDurationDisplay.innerText = `${face}주`;
    dom.onlineDurationDisplay.innerText = `${online}주`;
    if (dom.cleanupDurationDisplay) {
        dom.cleanupDurationDisplay.innerText = `${cleanup}주`;
    }
}

function handleCourseSubmit(e) {
    e.preventDefault();
    const id = dom.editCourseId.value;
    const name = document.getElementById('course-name').value.trim();
    const capacity = parseInt(document.getElementById('course-capacity').value);
    const group = dom.courseGroup.value.trim();
    const startRange = document.getElementById('course-start-range').value;
    const endRange = document.getElementById('course-end-range').value;
    const autoAdjustSequence = dom.courseAutoAdjust.checked;
    
    // 세그먼트 데이터 수집
    const segments = [];
    dom.segmentsContainer.querySelectorAll('.segment-item').forEach(row => {
        const type = row.querySelector('.seg-type-select').value;
        const duration = parseInt(row.querySelector('.seg-duration-input').value) || 1;
        segments.push({ type, duration });
    });
    
    if (segments.length === 0) {
        alert('최소 1개 이상의 주차(세그먼트) 일정이 추가되어야 합니다.');
        return;
    }

    const preferredRoomId = document.getElementById('course-preferred-room').value || null;

    if (id) {
        // 수정
        const course = state.courses.find(c => c.id === id);
        if (course) {
            course.name = name;
            course.capacity = capacity;
            course.group = group;
            course.startRange = startRange;
            course.endRange = endRange;
            course.segments = segments;
            course.autoAdjustSequence = autoAdjustSequence;
            course.preferredRoomId = preferredRoomId;
        }
    } else {
        // 추가
        const newId = `c-${Date.now()}`;
        state.courses.push({
            id: newId,
            name,
            capacity,
            group,
            startRange,
            endRange,
            segments,
            autoAdjustSequence,
            preferredRoomId
        });
        // 새로운 교육과정이 위치한 페이지로 자동 이동
        state.currentPage = Math.floor((state.courses.length - 1) / 10) + 1;
    }
    
    dom.modalCourse.classList.add('hidden');
    saveToLocalStorage();
    runScheduling();
    renderAll();
}

window.deleteCourse = function(courseId) {
    if (confirm('해당 교육과정을 삭제하시겠습니까?')) {
        state.courses = state.courses.filter(c => c.id !== courseId);
        // 삭제 후 현재 페이지 범위 초과 방지 보정
        const maxPage = Math.max(1, Math.ceil(state.courses.length / 10));
        if (state.currentPage > maxPage) {
            state.currentPage = maxPage;
        }
        saveToLocalStorage();
        runScheduling();
        renderAll();
    }
};

window.changeCoursePage = function(page) {
    state.currentPage = page;
    renderCourseList();
};

// --- 공통 온라인 주간 설정 관리 ---
function renderBlockedWeeks() {
    dom.blockedWeeksList.innerHTML = state.blockedWeeks.map(bw => {
        return `
            <div class="room-item" style="border-color: rgba(245, 158, 11, 0.25); background: rgba(245, 158, 11, 0.03);">
                <div class="room-info">
                    <span class="room-name" style="color: var(--warning); font-weight: 600;">${bw.label}</span>
                    <span class="room-capacity">연간 W${bw.weekNum}주차 (무조건 온라인)</span>
                </div>
                <div class="room-actions">
                    <button class="btn-icon" onclick="window.deleteBlockedWeek('${bw.id}')" title="삭제" style="color: var(--warning);">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function handleBlockedWeekSubmit(e) {
    e.preventDefault();
    const month = parseInt(document.getElementById('blocked-month').value);
    const week = parseInt(document.getElementById('blocked-week-of-month').value);
    
    // 동일한 조건이 이미 등록되어 있는지 체크
    const isDuplicate = state.blockedWeeks.some(bw => bw.month === month && bw.week === week);
    if (isDuplicate) {
        alert('이미 동일한 주차가 공통 온라인 주간으로 등록되어 있습니다.');
        return;
    }
    
    const weekNum = getWeekNumByMonthAndWeek(state.year, month, week);
    const newId = `bw-${Date.now()}`;
    const label = `${month}월 ${week}주차`;
    
    state.blockedWeeks.push({
        id: newId,
        month,
        week,
        weekNum,
        label
    });
    
    // 주차 오름차순으로 정렬
    state.blockedWeeks.sort((a, b) => a.weekNum - b.weekNum);
    
    dom.modalBlockedWeek.classList.add('hidden');
    saveToLocalStorage();
    runScheduling();
    renderAll();
}

window.deleteBlockedWeek = function(id) {
    if (confirm('이 공통 온라인 주간 설정을 삭제하시겠습니까? 관련 교육과정 일정들이 자동으로 재배정됩니다.')) {
        state.blockedWeeks = state.blockedWeeks.filter(bw => bw.id !== id);
        saveToLocalStorage();
        runScheduling();
        renderAll();
    }
};

// --- 유틸리티: HTML 이스케이프 ---
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// --- 파일 저장 및 불러오기 기능 ---
function exportDataToFile() {
    const data = {
        rooms: state.rooms,
        courses: state.courses,
        blockedWeeks: state.blockedWeeks,
        year: state.year
    };
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // YYYYMMDD 형식의 날짜 구하기
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}${mm}${dd}`;

    const link = document.createElement('a');
    link.download = `NHI_${state.year}_${dateStr}.json`;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function importDataFromFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(evt) {
        try {
            const data = JSON.parse(evt.target.result);
            if (!data.rooms || !data.courses || !data.blockedWeeks) {
                alert('유효하지 않은 데이터 파일 형식입니다. (필수 필드 누락)');
                return;
            }
            
            // 데이터 할당
            state.rooms = data.rooms;
            state.courses = data.courses;
            state.blockedWeeks = data.blockedWeeks;
            if (data.year) {
                state.year = parseInt(data.year) || state.year;
                const selectYearEl = document.getElementById('select-year');
                if (selectYearEl) {
                    selectYearEl.value = state.year.toString();
                }
            }
            
            // 데이터 동기화 및 재배정
            saveToLocalStorage();
            runScheduling();
            renderAll();
            alert('데이터 파일을 성공적으로 불러와 스케줄을 재작성했습니다.');
        } catch (err) {
            console.error(err);
            alert('파일을 가져오는 중 오류가 발생했습니다: ' + err.message);
        }
        e.target.value = ''; // 동일 파일 재업로드 지원을 위한 인풋 리셋
    };
    reader.readAsText(file);
}

// --- 차트 및 캘린더 이미지 저장 기능 ---
function saveChartAsImage() {
    const isGantt = state.currentView === 'gantt';
    const targetElement = isGantt ? dom.ganttView : dom.calendarView;
    
    // YYYYMMDD 형식의 날짜 구하기
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}${mm}${dd}`;
    
    const fileName = `NHI_${state.year}_${dateStr}.png`;
    
    const btnText = dom.btnSaveImage.querySelector('span');
    const originalText = btnText.innerText;
    btnText.innerText = '저장 중...';
    dom.btnSaveImage.disabled = true;

    // html2canvas 옵션 설정: 풀 스크롤 캡처와 고해상도를 지원
    html2canvas(targetElement, {
        useCORS: true,
        allowTaint: true,
        scale: 2, // 2배 고해상도
        backgroundColor: '#080c15', // 앱 배경색과 맞춤
        scrollX: 0,
        scrollY: 0,
        width: targetElement.scrollWidth,
        height: targetElement.scrollHeight,
        windowWidth: targetElement.scrollWidth,
        windowHeight: targetElement.scrollHeight
    }).then(canvas => {
        const link = document.createElement('a');
        link.download = fileName;
        link.href = canvas.toDataURL('image/png');
        link.click();
        
        btnText.innerText = originalText;
        dom.btnSaveImage.disabled = false;
    }).catch(err => {
        console.error('이미지 저장 오류:', err);
        alert('이미지 파일 변환 중 오류가 발생했습니다.');
        btnText.innerText = originalText;
        dom.btnSaveImage.disabled = false;
    });
}
