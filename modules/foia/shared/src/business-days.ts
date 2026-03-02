/**
 * Govli AI FOIA Module - Business Days Calculator
 * Handles FOIA deadline calculations with federal holidays
 */

/**
 * Federal holidays (fixed dates)
 */
const FIXED_HOLIDAYS = [
  { month: 0, day: 1 },   // New Year's Day
  { month: 6, day: 4 },   // Independence Day
  { month: 10, day: 11 }, // Veterans Day
  { month: 11, day: 25 }  // Christmas Day
];

/**
 * Calculate federal holidays for a given year
 */
function getFederalHolidays(year: number): Date[] {
  const holidays: Date[] = [];

  // Fixed holidays
  FIXED_HOLIDAYS.forEach(({ month, day }) => {
    const holiday = new Date(year, month, day);
    // If holiday falls on weekend, observe on Friday/Monday
    if (holiday.getDay() === 6) { // Saturday
      holidays.push(new Date(year, month, day - 1));
    } else if (holiday.getDay() === 0) { // Sunday
      holidays.push(new Date(year, month, day + 1));
    } else {
      holidays.push(holiday);
    }
  });

  // Martin Luther King Jr. Day (3rd Monday in January)
  holidays.push(getNthWeekdayOfMonth(year, 0, 1, 3));

  // Presidents' Day (3rd Monday in February)
  holidays.push(getNthWeekdayOfMonth(year, 1, 1, 3));

  // Memorial Day (last Monday in May)
  holidays.push(getLastWeekdayOfMonth(year, 4, 1));

  // Labor Day (1st Monday in September)
  holidays.push(getNthWeekdayOfMonth(year, 8, 1, 1));

  // Columbus Day (2nd Monday in October)
  holidays.push(getNthWeekdayOfMonth(year, 9, 1, 2));

  // Thanksgiving (4th Thursday in November)
  holidays.push(getNthWeekdayOfMonth(year, 10, 4, 4));

  return holidays;
}

/**
 * Get nth weekday of a month
 * @param year Year
 * @param month Month (0-11)
 * @param weekday Day of week (0=Sunday, 1=Monday, etc.)
 * @param n Which occurrence (1=first, 2=second, etc.)
 */
function getNthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  n: number
): Date {
  const firstDay = new Date(year, month, 1);
  const firstWeekday = firstDay.getDay();

  let diff = weekday - firstWeekday;
  if (diff < 0) diff += 7;

  const day = 1 + diff + (n - 1) * 7;
  return new Date(year, month, day);
}

/**
 * Get last weekday of a month
 */
function getLastWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number
): Date {
  const lastDay = new Date(year, month + 1, 0);
  const lastWeekday = lastDay.getDay();

  let diff = lastWeekday - weekday;
  if (diff < 0) diff += 7;

  const day = lastDay.getDate() - diff;
  return new Date(year, month, day);
}

/**
 * Check if a date is a business day (not weekend or federal holiday)
 */
export function isBusinessDay(date: Date): boolean {
  const day = date.getDay();

  // Weekend check
  if (day === 0 || day === 6) {
    return false;
  }

  // Holiday check
  const holidays = getFederalHolidays(date.getFullYear());
  return !holidays.some(holiday =>
    holiday.getFullYear() === date.getFullYear() &&
    holiday.getMonth() === date.getMonth() &&
    holiday.getDate() === date.getDate()
  );
}

/**
 * Add business days to a date
 * @param startDate Starting date
 * @param businessDays Number of business days to add
 * @returns Date after adding business days
 */
export function addBusinessDays(startDate: Date, businessDays: number): Date {
  const result = new Date(startDate);
  let remainingDays = businessDays;

  while (remainingDays > 0) {
    result.setDate(result.getDate() + 1);
    if (isBusinessDay(result)) {
      remainingDays--;
    }
  }

  return result;
}

/**
 * Calculate business days between two dates
 * @param startDate Start date
 * @param endDate End date
 * @returns Number of business days between dates
 */
export function countBusinessDays(startDate: Date, endDate: Date): number {
  let count = 0;
  const current = new Date(startDate);

  while (current <= endDate) {
    if (isBusinessDay(current)) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
}

/**
 * Calculate FOIA response due date
 * Standard FOIA response time is 20 business days
 * @param receivedDate Date request was received
 * @param businessDays Number of business days (default 20)
 * @returns Due date
 */
export function calculateFoiaDueDate(
  receivedDate: Date,
  businessDays: number = 20
): Date {
  return addBusinessDays(receivedDate, businessDays);
}

/**
 * Check if a FOIA request is overdue
 */
export function isFoiaOverdue(dueDate: Date, currentDate: Date = new Date()): boolean {
  return currentDate > dueDate;
}

/**
 * Get days remaining until due date (business days)
 */
export function getBusinessDaysUntilDue(
  dueDate: Date,
  currentDate: Date = new Date()
): number {
  if (currentDate > dueDate) {
    return 0;
  }
  return countBusinessDays(currentDate, dueDate);
}

/**
 * Get all federal holidays for a year
 */
export function getFederalHolidaysForYear(year: number): Date[] {
  return getFederalHolidays(year);
}
