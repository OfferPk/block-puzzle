global.window = global.window || {};
require('../www/js/themes.js');
const S = require('../www/js/shopcore.js');
module.exports = { groups: [ { name: 'themes', theme: true, items: window.THEMES }, { name: 'backgrounds', items: S.BACKGROUNDS } ] };
