// Some Windows editors write UTF-8 BOMs; they must not prevent deployment.
export function parseConfig(text){return JSON.parse(text.replace(/^\uFEFF/,''))}
