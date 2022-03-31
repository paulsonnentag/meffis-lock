export function classNames (classes, conditional) {
  if (!conditional) {
    conditional = classes
    classes = ''
  }

  for (let key in conditional) {
    if (conditional.hasOwnProperty(key)) {
      if (conditional[key]) {
        classes += (classes !== '' ? ' ' : '') + key
      }
    }
  }

  return classes
}