const _aa = (p, o) => p.reduce((xs, x) => (xs && xs[x]) ? xs[x] : null, o);

module.exports = {
  _aa
}
