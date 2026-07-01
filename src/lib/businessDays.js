export function addBusinessDays(days) {
  const date = new Date();

  let remaining = days;
  while (remaining > 0) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay(); // 0=Sunday, 6=Saturday

    if (day !== 0 && day !== 6) {
      remaining--;
    }
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const dayOfMonth = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${dayOfMonth}`;
}
