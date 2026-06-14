const url =
  "https://docs.google.com/spreadsheets/d/14wnnHgFvQRGvcOPjz7c1PsOO5fun5z6Z/gviz/tq?tqx=out:json&sheet=13JUNE2026";
const r = await fetch(url);
const t = await r.text();
const start = t.indexOf("{");
const end = t.lastIndexOf("}");
const json = JSON.parse(t.slice(start, end + 1));
const rows = json.table?.rows ?? [];

function cell(row, i) {
  const c = row.c?.[i];
  if (!c || c.v == null) return "";
  return String(c.v);
}

for (let i = 18; i < Math.min(25, rows.length); i++) {
  const cols = [];
  for (let c = 0; c < 10; c++) cols.push(cell(rows[i], c).slice(0, 30));
  console.log(i, cols.join(" | "));
}
