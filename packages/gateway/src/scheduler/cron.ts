/** Validate the five-field syntax supported by the scheduler's minute matcher. */
export function isValidCronExpression(cron: string): boolean {
  if (cron.length > 256) return false;
  const fields = cron.trim().split(/\s+/);
  const bounds: Array<[number, number]> = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]];
  if (fields.length !== bounds.length) return false;

  return fields.every((field, index) => {
    const [minimum, maximum] = bounds[index]!;
    const inRange = (value: string) => /^\d+$/.test(value)
      && Number(value) >= minimum && Number(value) <= maximum;
    if (field === "*") return true;
    if (/^\*\/\d+$/.test(field)) {
      const step = Number(field.slice(2));
      return Number.isSafeInteger(step) && step > 0;
    }
    if (field.includes(",")) return field.split(",").every(inRange);
    const range = /^(\d+)-(\d+)$/.exec(field);
    if (range) return inRange(range[1]!) && inRange(range[2]!) && Number(range[1]) <= Number(range[2]);
    return inRange(field);
  });
}
