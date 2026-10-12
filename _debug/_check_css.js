const fs = require('fs');
const css = fs.readFileSync('C:\\Users\\<原开发者>\\.openclaw\\workspace\\changban\\public\\css\\style.css', 'utf8');
// Find .page and .active rules
css.split('}').forEach(rule => {
  if (rule.includes('.page') || rule.includes('.active')) {
    console.log(rule.trim().substring(0, 200));
    console.log('---');
  }
});
