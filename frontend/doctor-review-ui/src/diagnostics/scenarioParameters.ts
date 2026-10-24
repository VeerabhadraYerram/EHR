/** Parse only the supported demonstration units, without truncating decimals. */
export function scenarioParameters(text: string) {
  const q = text.toLowerCase();
  const number = '(\\d+(?:\\.\\d+)?)';
  const walk = /walk|exercise/.test(q), carbs = /carb|carbohydrate/.test(q);
  const sequencing = /delay|sequence|sequencing/.test(q);
  const duration = Number(q.match(new RegExp('(?:walk|exercise)(?:\\s+for)?\\s+' + number))?.[1]
    ?? q.match(new RegExp(number + '\\s*(?:min|minute)'))?.[1] ?? 20);
  const grams = Number(q.match(new RegExp('(?:reduce|less|remove|cut|reduction|by)\\s+' + number + '\\s*(?:g|gram)'))?.[1]
    ?? q.match(new RegExp(number + '\\s*(?:g|gram)'))?.[1] ?? 25);
  const delay = Number(q.match(new RegExp(number + '\\s*(?:min|minute)'))?.[1] ?? 15);
  let error = '';
  if (/[-−]\s*\d/.test(q)) error = 'Use non-negative values within the demonstration bounds.';
  else if ((walk || sequencing) && /\d(?:\.\d+)?\s*(?:hours?\b|hrs?\b|h\b|km\b|kilomet|miles?\b|seconds?\b|secs?\b)/.test(q))
    error = 'Use minutes for walking or carbohydrate delay. Hours, distance and seconds are not interpreted by this demonstration parser.';
  else if (carbs && /\d(?:\.\d+)?\s*(?:kg\b|kilogram|oz\b|ounces?\b|lbs?\b|pounds?\b)/.test(q))
    error = 'Specify the carbohydrate reduction in grams.';
  else if (walk && (duration < 1 || duration > 60)) error = 'Use a walking duration of 1–60 minutes.';
  else if (carbs && (grams < 0 || grams > 60)) error = 'Use a carbohydrate reduction of 0–60 g.';
  else if (sequencing && (delay < 0 || delay > 60)) error = 'Choose a carbohydrate delay between 0 and 60 minutes.';
  return {duration, grams, delay, error};
}
