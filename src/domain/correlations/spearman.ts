export type CorrelationPoint = { date: string; value: number };

function ranks(values: number[]) {
  const indexed = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const result = new Array<number>(values.length);
  let position = 0;
  while (position < indexed.length) {
    let end = position;
    while (end + 1 < indexed.length && indexed[end + 1].value === indexed[position].value) end += 1;
    const averageRank = (position + end + 2) / 2;
    for (let index = position; index <= end; index += 1) result[indexed[index].index] = averageRank;
    position = end + 1;
  }
  return result;
}

function pearson(first: number[], second: number[]) {
  const firstMean = first.reduce((sum, value) => sum + value, 0) / first.length;
  const secondMean = second.reduce((sum, value) => sum + value, 0) / second.length;
  let numerator = 0;
  let firstSum = 0;
  let secondSum = 0;
  for (let index = 0; index < first.length; index += 1) {
    const firstDelta = first[index] - firstMean;
    const secondDelta = second[index] - secondMean;
    numerator += firstDelta * secondDelta;
    firstSum += firstDelta ** 2;
    secondSum += secondDelta ** 2;
  }
  const denominator = Math.sqrt(firstSum * secondSum);
  return denominator ? numerator / denominator : 0;
}

function addDays(date: string, days: number) {
  const result = new Date(`${date}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function spearmanCorrelation(first: CorrelationPoint[], second: CorrelationPoint[], lagDays = 0) {
  const secondByDate = new Map(second.map((point) => [point.date, point.value]));
  const pairs = first.flatMap((point) => {
    const secondValue = secondByDate.get(addDays(point.date, lagDays));
    return secondValue === undefined ? [] : [[point.value, secondValue] as const];
  });
  if (pairs.length < 6) return { coefficient: null, sampleSize: pairs.length, quality: "insufficient" as const };
  const coefficient = pearson(ranks(pairs.map(([value]) => value)), ranks(pairs.map(([, value]) => value)));
  return {
    coefficient: Math.round(coefficient * 1000) / 1000,
    sampleSize: pairs.length,
    quality: pairs.length >= 30 ? "ready" as const : "limited" as const,
  };
}
