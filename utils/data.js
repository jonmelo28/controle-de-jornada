
function getDaysInMonth(month, year) {
  const days = [];
  const totalDays = new Date(year, month, 0).getDate();
  for (let i = 1; i <= totalDays; i++) {
    const d = new Date(year, month - 1, i);
    d.setHours(0, 0, 0, 0);
    days.push(d);
  }
  return days;
}
module.exports = { getDaysInMonth };
