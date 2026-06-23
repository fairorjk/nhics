import { getMondayOfWeek, getWeekOfYear, getAdjustedStartDate, formatDate } from './holidays.js';

/**
 * 대면/온라인 주수를 기반으로 가능한 합리적인 세그먼트 배치 조합(Permutations)을 생성합니다.
 * 교육적으로 무리하지 않게 최대 3분할까지만 조합을 만듭니다.
 */
function generateSegmentPermutations(faceWeeks, onlineWeeks, originalSegments = null) {
    const permutations = [];
    
    // 1. 정리기간(cleanup) 세그먼트들만 분리
    const cleanupSegs = originalSegments 
        ? originalSegments.filter(s => s.type === 'cleanup') 
        : [];
        
    // 대면/온라인 세그먼트들만 필터링한 원래 순서
    const originalNonCleanup = originalSegments
        ? originalSegments.filter(s => s.type !== 'cleanup')
        : null;

    // 사용자 지정 순서가 있다면 최우선 검사 목록에 추가
    if (originalNonCleanup && originalNonCleanup.length > 0) {
        permutations.push(originalNonCleanup);
    }
    
    if (faceWeeks > 0 && onlineWeeks > 0) {
        // 1. 대면 우선 순차형 [대면 N주 -> 온라인 M주]
        permutations.push([
            { type: 'face-to-face', duration: faceWeeks },
            { type: 'online', duration: onlineWeeks }
        ]);
        
        // 2. 온라인 우선 순차형 [온라인 M주 -> 대면 N주]
        permutations.push([
            { type: 'online', duration: onlineWeeks },
            { type: 'face-to-face', duration: faceWeeks }
        ]);
        
        // 3. 대면 분할형 [대면 X주 -> 온라인 M주 -> 대면 (N-X)주]
        for (let x = 1; x < faceWeeks; x++) {
            permutations.push([
                { type: 'face-to-face', duration: x },
                { type: 'online', duration: onlineWeeks },
                { type: 'face-to-face', duration: faceWeeks - x }
            ]);
        }
        
        // 4. 온라인 분할형 [온라인 Y주 -> 대면 N주 -> 온라인 (M-Y)주]
        for (let y = 1; y < onlineWeeks; y++) {
            permutations.push([
                { type: 'online', duration: y },
                { type: 'face-to-face', duration: faceWeeks },
                { type: 'online', duration: onlineWeeks - y }
            ]);
        }
    } else {
        if (faceWeeks > 0) {
            permutations.push([{ type: 'face-to-face', duration: faceWeeks }]);
        } else if (onlineWeeks > 0) {
            permutations.push([{ type: 'online', duration: onlineWeeks }]);
        }
    }
    
    // 중복 조합 제거 (예: face=1, online=1인 경우 1번과 2번이 같음)
    const uniquePerms = [];
    const seen = new Set();
    
    permutations.forEach(perm => {
        const key = perm.map(s => `${s.type}:${s.duration}`).join(',');
        if (!seen.has(key)) {
            seen.add(key);
            // 최종적으로 각 조합 뒤에 분리했던 정리기간 세그먼트들을 다시 붙임
            uniquePerms.push([...perm, ...cleanupSegs]);
        }
    });
    
    return uniquePerms;
}

/**
 * 교육과정 자동 일정 편성을 수행합니다. (백트래킹 최적화 모델)
 * @param {Array} courses - 교육과정 목록
 * @param {Array} rooms - 강의실 목록
 * @param {number} year - 스케줄링 연도 (기본 2026)
 * @returns {Object} { scheduledCourses, conflicts, roomUtilization }
 */
export function generateSchedule(courses, rooms, year = 2026, blockedWeeks = []) {
    const scheduledCourses = [];
    const conflicts = [];
    
    // 강의실별 주차 점유 현황 (1주차 ~ 53주차)
    const occupancyMap = {};
    rooms.forEach(room => {
        occupancyMap[room.id] = {};
        for (let w = 1; w <= 53; w++) {
            occupancyMap[room.id][w] = null;
        }
    });

    // 그룹별 주차 점유 현황 (그룹명 -> { week: courseId })
    const groupOccupancyMap = {};

    // 공통 온라인 주간 (SYSTEM_BLOCK) 지정 반영
    blockedWeeks.forEach(w => {
        rooms.forEach(room => {
            if (occupancyMap[room.id] && w >= 1 && w <= 53) {
                occupancyMap[room.id][w] = 'SYSTEM_BLOCK';
            }
        });
    });

    // 각 교육과정의 기본 속성 전처리 및 검증
    const processedCourses = courses.map((course, index) => {
        let segments = course.segments || [];
        
        let faceWeeks = 0;
        let onlineWeeks = 0;
        let cleanupWeeks = 0;
        
        if (segments.length > 0) {
            faceWeeks = segments.filter(s => s.type === 'face-to-face').reduce((sum, s) => sum + parseInt(s.duration || 0), 0);
            onlineWeeks = segments.filter(s => s.type === 'online').reduce((sum, s) => sum + parseInt(s.duration || 0), 0);
            cleanupWeeks = segments.filter(s => s.type === 'cleanup').reduce((sum, s) => sum + parseInt(s.duration || 0), 0);
        } else {
            faceWeeks = parseInt(course.faceWeeks) || 0;
            onlineWeeks = parseInt(course.onlineWeeks) || 0;
            cleanupWeeks = parseInt(course.cleanupWeeks) || 0;
            segments = [];
            if (faceWeeks > 0) segments.push({ type: 'face-to-face', duration: faceWeeks });
            if (onlineWeeks > 0) segments.push({ type: 'online', duration: onlineWeeks });
            if (cleanupWeeks > 0) segments.push({ type: 'cleanup', duration: cleanupWeeks });
        }

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
            ...course,
            originalSegments: JSON.parse(JSON.stringify(segments)),
            faceWeeks,
            onlineWeeks,
            cleanupWeeks,
            totalDuration,
            startWeek,
            endWeek,
            windowSize,
            capacity: parseInt(course.capacity) || 0,
            autoAdjustSequence: course.autoAdjustSequence !== false,
            listOrder: index
        };
    });

    // 우선순위 정렬: 목록 순서가 앞선 과정이 충돌 시 우선권을 갖도록 리스트 순서(listOrder) 기준으로 오름차순 정렬
    processedCourses.sort((a, b) => a.listOrder - b.listOrder);

    // 글로벌 최적 조합 탐색용 상태 기억 변수
    let bestScheduledCount = -1;
    let bestScheduledCourses = [];
    let bestOccupancyMap = null;
    
    let searchSteps = 0;
    const MAX_SEARCH_STEPS = 15000; // 브라우저 프리징 절대 방지
    let hitMaxSteps = false;

    // 백트래킹 탐색 (DFS + Branch-and-Bound)
    function backtrack(courseIndex, currentScheduledCount, currentAllocations) {
        if (hitMaxSteps) return;
        searchSteps++;
        if (searchSteps > MAX_SEARCH_STEPS) {
            hitMaxSteps = true;
            return;
        }

        // 가지치기 (Branch and Bound): 남은 과정을 다 더해도 기존 최대 배정 개수를 넘지 못하면 스킵
        const remainingCount = processedCourses.length - courseIndex;
        if (currentScheduledCount + remainingCount <= bestScheduledCount) {
            return;
        }

        // 모든 교육과정 탐색 종료 시점
        if (courseIndex === processedCourses.length) {
            if (currentScheduledCount > bestScheduledCount) {
                bestScheduledCount = currentScheduledCount;
                bestScheduledCourses = JSON.parse(JSON.stringify(currentAllocations));
                bestOccupancyMap = JSON.parse(JSON.stringify(occupancyMap));
            }
            return;
        }

        const course = processedCourses[courseIndex];
        
        // 강의실 탐색
        let eligibleRooms = rooms
            .filter(r => r.seats >= course.capacity)
            .sort((a, b) => a.seats - b.seats);

        if (course.preferredRoomId) {
            eligibleRooms.sort((a, b) => {
                if (a.id === course.preferredRoomId) return -1;
                if (b.id === course.preferredRoomId) return 1;
                return a.seats - b.seats;
            });
        }

        if (eligibleRooms.length === 0) {
            // 강의실 수용 불가 오류
            currentAllocations.push({ 
                ...course, 
                scheduled: false, 
                failReason: `과정 인원(${course.capacity}명)을 수용할 수 있는 강의실이 존재하지 않습니다.` 
            });
            backtrack(courseIndex + 1, currentScheduledCount, currentAllocations);
            currentAllocations.pop();
            if (hitMaxSteps) return;
            return;
        }

        // 세그먼트 순서 조합 목록 생성
        let permutations = [course.originalSegments];
        if (course.autoAdjustSequence) {
            permutations = generateSegmentPermutations(course.faceWeeks, course.onlineWeeks, course.originalSegments);
        }

        const maxStartWeek = course.endWeek - course.totalDuration + 1;
        
        const startParts = (course.startRange || '').split('-');
        const limitStart = startParts.length === 3
            ? new Date(parseInt(startParts[0]), parseInt(startParts[1]) - 1, parseInt(startParts[2]))
            : new Date();
        limitStart.setHours(0, 0, 0, 0);

        const endParts = (course.endRange || '').split('-');
        const limitEnd = endParts.length === 3
            ? new Date(parseInt(endParts[0]), parseInt(endParts[1]) - 1, parseInt(endParts[2]))
            : new Date();
        limitEnd.setHours(0, 0, 0, 0);

        // 옵션 A: 이 과정을 정상적으로 일정에 배정 시도
        for (const perm of permutations) {
            for (let w = course.startWeek; w <= maxStartWeek; w++) {
                // 시작일 및 종료일 경계 조건 검증
                const overallMonday = getMondayOfWeek(w, year);
                const startDateObj = getAdjustedStartDate(overallMonday);
                startDateObj.setHours(0, 0, 0, 0);
                
                const overallFriday = new Date(overallMonday);
                overallFriday.setDate(overallMonday.getDate() + 4 + (course.totalDuration - 1) * 7);
                overallFriday.setHours(0, 0, 0, 0);
                
                if (startDateObj < limitStart || overallFriday > limitEnd) {
                    continue; // 희망 기간 이탈
                }

                // 같은 그룹 내 리스트 순서에 따른 일정 시작 주차 순서 제약 조건 검증 (제거됨: 목록 순서는 우선순위로만 작동)

                // 그룹 중복 운영 방지 체크
                let hasGroupOverlap = false;
                if (course.group) {
                    const grp = course.group.trim();
                    if (grp) {
                        for (let checkW = w; checkW < w + course.totalDuration; checkW++) {
                            if (groupOccupancyMap[grp] && groupOccupancyMap[grp][checkW]) {
                                hasGroupOverlap = true;
                                break;
                            }
                        }
                    }
                }
                if (hasGroupOverlap) continue;

                // 강의실 중복 이용 체크
                for (const room of eligibleRooms) {
                    let isRoomAvailable = true;
                    let currentOffset = 0;

                    for (const seg of perm) {
                        const segStart = w + currentOffset;
                        const segEnd = segStart + parseInt(seg.duration) - 1;
                        
                        if (seg.type === 'face-to-face') {
                            for (let checkW = segStart; checkW <= segEnd; checkW++) {
                                if (occupancyMap[room.id][checkW] !== null) {
                                    isRoomAvailable = false;
                                    break;
                                }
                            }
                        }
                        if (!isRoomAvailable) break;
                        currentOffset += parseInt(seg.duration);
                    }

                    if (isRoomAvailable) {
                        // 일시적으로 점유 상태 설정 (Trial Allocation)
                        let currentOffset2 = 0;
                        perm.forEach(seg => {
                            const segStart = w + currentOffset2;
                            const segEnd = segStart + parseInt(seg.duration) - 1;
                            if (seg.type === 'face-to-face') {
                                for (let checkW = segStart; checkW <= segEnd; checkW++) {
                                    occupancyMap[room.id][checkW] = course.id;
                                }
                            }
                            currentOffset2 += parseInt(seg.duration);
                        });

                        if (course.group) {
                            const grp = course.group.trim();
                            if (grp) {
                                if (!groupOccupancyMap[grp]) {
                                    groupOccupancyMap[grp] = {};
                                }
                                for (let checkW = w; checkW < w + course.totalDuration; checkW++) {
                                    groupOccupancyMap[grp][checkW] = course.id;
                                }
                            }
                        }

                        // 다음 과정 배정 탐색을 위해 재귀 호출
                        currentAllocations.push({
                            ...course,
                            scheduled: true,
                            bestStartWeek: w,
                            bestRoomId: room.id,
                            successfulPerm: perm
                        });

                        backtrack(courseIndex + 1, currentScheduledCount + 1, currentAllocations);

                        // 재귀 탐색 완료 후 점유 롤백 (Backtrack)
                        currentAllocations.pop();
                        if (hitMaxSteps) return;

                        let currentOffset3 = 0;
                        perm.forEach(seg => {
                            const segStart = w + currentOffset3;
                            const segEnd = segStart + parseInt(seg.duration) - 1;
                            if (seg.type === 'face-to-face') {
                                for (let checkW = segStart; checkW <= segEnd; checkW++) {
                                    if (occupancyMap[room.id][checkW] === course.id) {
                                        occupancyMap[room.id][checkW] = null;
                                    }
                                }
                            }
                            currentOffset3 += parseInt(seg.duration);
                        });

                        if (course.group) {
                            const grp = course.group.trim();
                            if (grp && groupOccupancyMap[grp]) {
                                for (let checkW = w; checkW < w + course.totalDuration; checkW++) {
                                    if (groupOccupancyMap[grp][checkW] === course.id) {
                                        groupOccupancyMap[grp][checkW] = null;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // 옵션 B: 이 과정을 배정하지 않고 건너뛰는 경로 시도 (후순위 과정을 배정하기 위한 슬롯 양보)
        currentAllocations.push({
            ...course,
            scheduled: false,
            failReason: `가용 기간(${course.startRange} ~ ${course.endRange}) 중 대면 기간 동안 ${course.capacity}명 이상 수용 가능한 강의실 슬롯이 부족하거나 타 교육과정과 겹칩니다. (순서 자동 조정 시도 포함)`
        });
        backtrack(courseIndex + 1, currentScheduledCount, currentAllocations);
        currentAllocations.pop();
        if (hitMaxSteps) return;
    }

    // 백트래킹 전체 최적 배정 실행
    backtrack(0, 0, []);

    // 결과 빌드
    const finalAllocations = bestScheduledCourses;

    if (finalAllocations.length === 0) {
        // 백트래킹 결과가 아예 없는 경우 (강의실 수용 자체가 불가능한 경우 등)
        processedCourses.forEach(c => {
            scheduledCourses.push({ ...c, scheduled: false, segments: c.originalSegments });
            conflicts.push({
                courseId: c.id,
                courseName: c.name,
                reason: `과정 인원(${c.capacity}명)을 수용할 수 있는 강의실이 존재하지 않거나 타임라인이 충돌합니다.`
            });
        });
    } else {
        finalAllocations.forEach(alloc => {
            if (alloc.scheduled) {
                const bestStartWeek = alloc.bestStartWeek;
                const bestRoomId = alloc.bestRoomId;
                const perm = alloc.successfulPerm;

                const originalKey = alloc.originalSegments.map(s => `${s.type}:${s.duration}`).join(',');
                const successKey = perm.map(s => `${s.type}:${s.duration}`).join(',');
                const sequenceAdjusted = originalKey !== successKey;

                let currentOffset = 0;
                const segmentDetails = [];

                perm.forEach(seg => {
                    const segStart = bestStartWeek + currentOffset;
                    const segEnd = segStart + parseInt(seg.duration) - 1;
                    
                    const segMondayDate = getMondayOfWeek(segStart, year);
                    const segFridayDate = new Date(segMondayDate);
                    segFridayDate.setDate(segMondayDate.getDate() + 4 + (parseInt(seg.duration) - 1) * 7);

                    const adjustedStart = getAdjustedStartDate(segMondayDate);

                    segmentDetails.push({
                        type: seg.type,
                        duration: parseInt(seg.duration),
                        startWeek: segStart,
                        endWeek: segEnd,
                        startDate: formatDate(adjustedStart),
                        endDate: formatDate(segFridayDate),
                        roomId: seg.type === 'face-to-face' ? bestRoomId : null
                    });

                    currentOffset += parseInt(seg.duration);
                });

                const overallMonday = getMondayOfWeek(bestStartWeek, year);
                const overallFriday = new Date(overallMonday);
                overallFriday.setDate(overallMonday.getDate() + 4 + (alloc.totalDuration - 1) * 7);

                const adjustedText = perm.map(s => `${s.type === 'face-to-face' ? '대면' : '온라인'} ${s.duration}주`).join(' - ');

                scheduledCourses.push({
                    ...alloc,
                    scheduled: true,
                    startWeek: bestStartWeek,
                    startDate: formatDate(getAdjustedStartDate(overallMonday)),
                    endDate: formatDate(overallFriday),
                    assignedRoomId: bestRoomId,
                    scheduleSegments: segmentDetails,
                    segments: perm,
                    sequenceAdjusted,
                    adjustedText
                });
            } else {
                conflicts.push({
                    courseId: alloc.id,
                    courseName: alloc.name,
                    reason: alloc.failReason || '가용한 강의실 슬롯이 부족하거나 일정이 충돌합니다.'
                });
                scheduledCourses.push({
                    ...alloc,
                    scheduled: false,
                    segments: alloc.originalSegments
                });
            }
        });
    }

    // 강의실별 최종 이용률 계산
    const roomUtilization = {};
    const targetOccupancyMap = bestOccupancyMap || occupancyMap;
    rooms.forEach(room => {
        let occupiedWeeks = 0;
        for (let w = 1; w <= 52; w++) {
            if (targetOccupancyMap[room.id] && targetOccupancyMap[room.id][w] !== null && targetOccupancyMap[room.id][w] !== 'SYSTEM_BLOCK') {
                occupiedWeeks++;
            }
        }
        roomUtilization[room.id] = Math.round((occupiedWeeks / 52) * 100);
    });

    if (hitMaxSteps) {
        console.warn(`[Scheduler] Maximum search steps (${MAX_SEARCH_STEPS}) reached. Returning best allocation found so far.`);
    }

    return {
        scheduledCourses,
        conflicts,
        roomUtilization,
        hitMaxSteps,
        searchSteps
    };
}
