function padRight(str: string, width: number): string {
  let visible = 0;
  for (const ch of str) {
    visible += (ch.charCodeAt(0) > 127 ? 2 : 1);
  }
  const padding = Math.max(0, width - visible);
  return str + " ".repeat(padding);
}

function padLeft(str: string, width: number): string {
  let visible = 0;
  for (const ch of str) {
    visible += (ch.charCodeAt(0) > 127 ? 2 : 1);
  }
  const padding = Math.max(0, width - visible);
  return " ".repeat(padding) + str;
}

type ColumnDef = { header: string; width: number; align: "left" | "right" };
type Row = string[];

export function formatTable(title: string, columns: ColumnDef[], rows: Row[]): string {
  const sep = columns.map((c) => "─".repeat(c.width)).join("─┼─");
  const topBorder = "╭" + columns.map((c) => "─".repeat(c.width)).join("─┬─") + "╮";
  const midBorder = "├" + sep + "┤";
  const botBorder = "╰" + columns.map((c) => "─".repeat(c.width)).join("─┴─") + "╯";

  const headerCells = columns.map((c, i) =>
    c.align === "right" ? padLeft(c.header, c.width) : padRight(c.header, c.width)
  );
  const headerLine = "│ " + headerCells.join(" │ ") + " │";

  const lines: string[] = [];
  lines.push(topBorder);
  lines.push(headerLine);

  if (rows.length > 0) {
    lines.push(midBorder);
    for (const row of rows) {
      const cells = row.map((cell, i) => {
        const col = columns[i];
        return col.align === "right" ? padLeft(cell, col.width) : padRight(cell, col.width);
      });
      lines.push("│ " + cells.join(" │ ") + " │");
    }
  }

  lines.push(botBorder);
  return title + "\n" + lines.join("\n");
}

export function formatKeyValue(kv: [string, string][]): string {
  const maxKey = Math.max(...kv.map(([k]) => k.length));
  return kv.map(([k, v]) => `  ${padRight(k + ":", maxKey + 2)}${v}`).join("\n");
}
