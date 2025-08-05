const TelegramBot = require("node-telegram-bot-api");
const dayjs = require("dayjs");
const fs = require("fs");
const path = require("path");

const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token);

const checklistFile = path.join(__dirname, "../../checklist.json");
const logFile = path.join(__dirname, "../../log.txt");
const notesFile = path.join(__dirname, "../../notes.json");

const estimateBudget = parseInt(process.env.ESTIMATE_BUDGET || "0");
const matchDate = dayjs(process.env.MATCH_DATE || "2026-03-28");

// ─── Helpers ────────────────────────────────────────────────
function safeJsonRead(filePath, defaultValue = {}) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
      return defaultValue;
    }
    const data = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(data);
  } catch {
    return defaultValue;
  }
}
function saveJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}
function loadChecklist() {
  return safeJsonRead(checklistFile, {
    visa: false,
    flight: false,
    ticket: false,
    savedBudget: 0,
  });
}
function saveChecklist(data) {
  saveJson(checklistFile, data);
}
function loadNotes() {
  return safeJsonRead(notesFile, []);
}
function saveNotes(data) {
  saveJson(notesFile, data);
}
function appendToLog(message) {
  const log = `\n[${dayjs().format("YYYY-MM-DD HH:mm")}] ${message}`;
  fs.appendFileSync(logFile, log);
}
function getTimeLeft() {
  const today = dayjs();
  const diff = matchDate.diff(today, "day");
  return {
    months: Math.floor(diff / 30),
    days: diff % 30,
  };
}

// ─── Bot Command Handlers ──────────────────────────────────
bot.setMyCommands([
  { command: "start", description: "Activate the bot" },
  { command: "status", description: "Show checklist & budget status" },
  { command: "check", description: "Mark checklist item as done" },
  { command: "uncheck", description: "Mark checklist item as undone" },
  { command: "progress", description: "Show progress percent" },
  { command: "savenote", description: "Save a note" },
  { command: "notes", description: "Show saved notes" },
  { command: "clearnotes", description: "Clear all notes" },
  { command: "log", description: "Show last 5 logs" },
  { command: "setbudget", description: "Set saved budget" },
]);

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "🏆 Finalissima Goal Tracker Activated! Use /status to check progress."
  );
});

bot.onText(/\/status/, (msg) => {
  const checklist = loadChecklist();
  const notes = loadNotes();
  const { months, days } = getTimeLeft();
  const completed = [checklist.visa, checklist.flight, checklist.ticket].filter(
    Boolean
  ).length;
  const percent = Math.floor((completed / 3) * 100);
  const remaining = estimateBudget - checklist.savedBudget;

  const message = `📅 ${months} months, ${days} days left.
✅ Checklist:
- Visa: ${checklist.visa ? "✅" : "❌"}
- Flight: ${checklist.flight ? "✅" : "❌"}
- Ticket: ${checklist.ticket ? "✅" : "❌"}
Progress: ${percent}%
💰 Budget: $${checklist.savedBudget.toLocaleString()} / $${estimateBudget.toLocaleString()}
📉 Remaining: $${remaining.toLocaleString()}
📝 Notes: ${notes.length > 0 ? notes.join(" | ") : "None"}`;

  bot.sendMessage(msg.chat.id, message);
});

bot.onText(/\/check (visa|flight|ticket)/, (msg, match) => {
  const checklist = loadChecklist();
  checklist[match[1]] = true;
  saveChecklist(checklist);
  bot.sendMessage(msg.chat.id, `${match[1]} marked as ✅`);
});

bot.onText(/\/uncheck (visa|flight|ticket)/, (msg, match) => {
  const checklist = loadChecklist();
  checklist[match[1]] = false;
  saveChecklist(checklist);
  bot.sendMessage(msg.chat.id, `${match[1]} marked as ❌`);
});

bot.onText(/\/progress/, (msg) => {
  const checklist = loadChecklist();
  const done = [checklist.visa, checklist.flight, checklist.ticket].filter(
    Boolean
  ).length;
  bot.sendMessage(
    msg.chat.id,
    `Progress: ${done}/3 (${Math.floor((done / 3) * 100)}%) complete.`
  );
});

bot.onText(/\/savenote (.+)/, (msg, match) => {
  const notes = loadNotes();
  notes.push(match[1]);
  saveNotes(notes);
  bot.sendMessage(msg.chat.id, "Note saved ✅");
});

bot.onText(/\/notes/, (msg) => {
  const notes = loadNotes();
  bot.sendMessage(
    msg.chat.id,
    notes.length ? `📝 Notes:\n- ${notes.join("\n- ")}` : "No saved notes."
  );
});

bot.onText(/\/clearnotes/, (msg) => {
  saveNotes([]);
  bot.sendMessage(msg.chat.id, "All notes cleared ❌");
});

bot.onText(/\/log/, (msg) => {
  if (!fs.existsSync(logFile))
    return bot.sendMessage(msg.chat.id, "No logs yet.");
  const logs = fs.readFileSync(logFile, "utf-8").trim().split("\n");
  bot.sendMessage(msg.chat.id, `📋 Last 5 Logs:\n${logs.slice(-5).join("\n")}`);
});

bot.onText(/\/setbudget (\d+)/, (msg, match) => {
  const checklist = loadChecklist();
  checklist.savedBudget = parseInt(match[1]);
  saveChecklist(checklist);
  bot.sendMessage(
    msg.chat.id,
    `✅ Saved budget updated to $${checklist.savedBudget.toLocaleString()}`
  );
});

// ─── Webhook Handler ───────────────────────────────────────
module.exports = async (req, res) => {
  if (req.method === "POST") {
    await bot.processUpdate(req.body);
    res.status(200).send("OK");
  } else {
    res.status(200).send("FinalissimaGoalBot Webhook Running...");
  }
};
