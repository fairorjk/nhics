// 2025년 ~ 2027년 대한민국 공휴일 및 대체공휴일 목록
export const HOLIDAYS_DB = {
    // 2025년
    '2025-01-01': '신정',
    '2025-01-28': '설날 연휴',
    '2025-01-29': '설날',
    '2025-01-30': '설날 연휴',
    '2025-03-03': '삼일절 대체공휴일', // 3/1(토)에 따른 월요일 대체공휴일
    '2025-05-05': '어린이날 / 부처님오신날', // 겹침
    '2025-05-06': '대체공휴일',
    '2025-06-06': '현충일',
    '2025-08-15': '광복절',
    '2025-10-03': '개천절',
    '2025-10-05': '추석 연휴',
    '2025-10-06': '추석',
    '2025-10-07': '추석 연휴',
    '2025-10-08': '대체공휴일', // 추석 연휴(일~화)에 따른 수요일 대체공휴일
    '2025-10-09': '한글날',
    '2025-12-25': '성탄절',

    // 2026년
    '2026-01-01': '신정',
    '2026-02-16': '설날 연휴',
    '2026-02-17': '설날',
    '2026-02-18': '설날 연휴',
    '2026-03-02': '삼일절 대체공휴일',
    '2026-05-05': '어린이날',
    '2026-05-25': '부처님오신날 대체공휴일',
    '2026-06-06': '현충일',
    '2026-08-15': '광복절',
    '2026-08-17': '광복절 대체공휴일',
    '2026-09-24': '추석 연휴',
    '2026-09-25': '추석',
    '2026-09-26': '추석 연휴',
    '2026-09-28': '추석 대체공휴일',
    '2026-10-03': '개천절',
    '2026-10-05': '개천절 대체공휴일',
    '2026-10-09': '한글날',
    '2026-12-25': '성탄절',

    // 2027년
    '2027-01-01': '신정',
    '2027-02-06': '설날 연휴',
    '2027-02-07': '설날',
    '2027-02-08': '설날 연휴',
    '2027-02-09': '설날 대체공휴일',
    '2027-03-01': '삼일절',
    '2027-05-05': '어린이날',
    '2027-05-13': '부처님오신날',
    '2027-06-06': '현충일',
    '2027-08-15': '광복절',
    '2027-08-16': '광복절 대체공휴일',
    '2027-09-14': '추석 연휴',
    '2027-09-15': '추석',
    '2027-09-16': '추석 연휴',
    '2027-10-03': '개천절',
    '2027-10-04': '개천절 대체공휴일',
    '2027-10-09': '한글날',
    '2027-12-25': '성탄절'
};

/**
 * 특정 날짜가 공휴일인지 확인합니다.
 * @param {Date|string} date - 확인할 날짜
 * @returns {string|null} 공휴일 이름 또는 null
 */
export function getHolidayName(date) {
    const d = new Date(date);
    if (isNaN(d.getTime())) return null;
    
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    return HOLIDAYS_DB[dateStr] || null;
}

/**
 * 날짜가 주말(토, 일)인지 확인합니다.
 * @param {Date} date 
 * @returns {boolean}
 */
export function isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6;
}

/**
 * 시작일이 월요일이고 공휴일일 경우, 화요일(그 다음날)로 보정한 날짜를 반환합니다.
 * @param {Date|string} date - 월요일 날짜
 * @returns {Date} 보정된 시작일
 */
export function getAdjustedStartDate(date) {
    let d = new Date(date);
    
    if (d.getDay() === 1) {
        const holidayName = getHolidayName(d);
        if (holidayName) {
            const adjusted = new Date(d);
            adjusted.setDate(adjusted.getDate() + 1);
            return adjusted;
        }
    }
    
    return d;
}

/**
 * YYYY-MM-DD 형식으로 포맷팅
 */
export function formatDate(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 기준일이 속한 주의 월요일 날짜를 구합니다.
 */
export function getMonday(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}

/**
 * 특정 일자의 주차 번호(1~52)를 반환합니다 (해당 일자의 연도 기준).
 */
export function getWeekOfYear(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const startOfYear = new Date(year, 0, 1);
    
    const firstMonday = getMonday(startOfYear);
    const diff = d - firstMonday;
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    
    return Math.floor(diff / oneWeek) + 1;
}

/**
 * 주차 번호와 연도를 기준으로 해당 주차의 월요일 날짜를 반환합니다.
 */
export function getMondayOfWeek(weekNum, year = 2026) {
    const startOfYear = new Date(year, 0, 1);
    const firstMonday = getMonday(startOfYear);
    const targetMonday = new Date(firstMonday);
    targetMonday.setDate(firstMonday.getDate() + (weekNum - 1) * 7);
    return targetMonday;
}

/**
 * 연도, 월, 해당 월의 주차(1~5)를 기준으로 연중 주차 번호(1~52)를 계산하여 반환합니다.
 */
export function getWeekNumByMonthAndWeek(year, month, weekOfMonth) {
    const firstDay = new Date(year, month - 1, 1);
    const day = firstDay.getDay();
    const firstMondayOffset = day === 1 ? 0 : (day === 0 ? 1 : 8 - day);
    const targetMonday = new Date(year, month - 1, 1 + firstMondayOffset + (weekOfMonth - 1) * 7);
    
    if (targetMonday.getFullYear() !== year) {
        return month === 12 ? 52 : 1;
    }
    
    return getWeekOfYear(targetMonday);
}
