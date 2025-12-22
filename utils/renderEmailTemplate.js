const fs = require("fs");
const path = require("path");

function renderEmailTemplate({ name, body }) {
  const templatePath = path.join(process.cwd(), "public", "emailTemplate.html");

  let html = fs.readFileSync(templatePath, "utf8");

  html = html.replace(/{{name}}/g, name);
  html = html.replace(/{{bodyText}}/g, body);

  return html;
}

module.exports = { renderEmailTemplate };
