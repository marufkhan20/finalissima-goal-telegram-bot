// index.js
require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const schedule = require("node-schedule");
const dayjs = require("dayjs");
const fs = require("fs");
const path = require("path");

const token = process.env.BOT_TOKEN;
const chatId = process.env.CHAT_ID;
const matchDate = dayjs(process.env.MATCH_DATE || "2026-03-28");
const estimateBudget = parseInt(process.env.ESTIMATE_BUDGET || "0");

const bot = new TelegramBot(token, { polling: true });

const checklistFile = path.join(__dirname, "checklist.json");
const logFile = path.join(__dirname, "log.txt");
const notesFile = path.join(__dirname, "notes.json");

const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

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

function safeJsonRead(filePath, defaultValue = {}) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
      return defaultValue;
    }
    const data = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    console.error("Failed to read or parse file:", err);
    return defaultValue;
  }
}

function saveJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// Load checklist
function loadChecklist() {
  return safeJsonRead(checklistFile, {
    visa: false,
    flight: false,
    ticket: false,
    savedBudget: 0,
  });
}

function saveChecklist(checklist) {
  saveJson(checklistFile, checklist);
}

// Load Notes
function loadNotes() {
  return safeJsonRead(notesFile, []);
}

function saveNotes(notes) {
  saveJson(notesFile, notes);
}

// Save to log
function appendToLog(message) {
  const logEntry = `\n[${dayjs().format("YYYY-MM-DD HH:mm")}] ${message}`;
  fs.appendFileSync(logFile, logEntry);
}

// Calculate time left
function getTimeLeft() {
  const today = dayjs();
  const diff = matchDate.diff(today, "day");
  const months = Math.floor(diff / 30);
  const days = diff % 30;
  return { months, days };
}

// Runs at 9:00 AM every Friday
schedule.scheduleJob("0 9 * * 5", () => {
  const { months, days } = getTimeLeft();
  const checklist = loadChecklist();
  const remaining = estimateBudget - checklist.savedBudget;

  const message = `⏰ Reminder:
📅 ${months} months, ${days} days left until Finalissima 2026.
✅ Visa: ${checklist.visa ? "✅" : "❌"} | Flight: ${
    checklist.flight ? "✅" : "❌"
  } | Ticket: ${checklist.ticket ? "✅" : "❌"}
💰 Budget: $${checklist.savedBudget.toLocaleString()} saved out of $${estimateBudget.toLocaleString()}
📉 Remaining: $${remaining.toLocaleString()}`;

  bot.sendMessage(chatId, message);
  appendToLog(message);
});

// /start command
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "🏆 Finalissima Goal Tracker Activated! Use /status to check progress."
  );
});

// /status command
bot.onText(/\/status/, (msg) => {
  const { months, days } = getTimeLeft();
  const checklist = loadChecklist();
  const notes = loadNotes();
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

// /check and /uncheck
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

// /progress command
bot.onText(/\/progress/, (msg) => {
  const checklist = loadChecklist();
  const total = 3; // visa, flight, ticket
  const done = [checklist.visa, checklist.flight, checklist.ticket].filter(
    Boolean
  ).length;
  bot.sendMessage(
    msg.chat.id,
    `Progress: ${done}/${total} (${Math.floor(
      (done / total) * 100
    )}%) complete.`
  );
});

// /savenote command
bot.onText(/\/savenote (.+)/, (msg, match) => {
  const notes = loadNotes();
  notes.push(match[1]);
  saveNotes(notes);
  bot.sendMessage(msg.chat.id, "Note saved ✅");
});

// /notes command
bot.onText(/\/notes/, (msg) => {
  const notes = loadNotes();
  if (notes.length === 0)
    return bot.sendMessage(msg.chat.id, "No saved notes.");
  bot.sendMessage(msg.chat.id, `📝 Notes:\n- ${notes.join("\n- ")}`);
});

// /clearnotes command
bot.onText(/\/clearnotes/, (msg) => {
  saveNotes([]);
  bot.sendMessage(msg.chat.id, "All notes cleared ❌");
});

// /log command
bot.onText(/\/log/, (msg) => {
  if (!fs.existsSync(logFile))
    return bot.sendMessage(msg.chat.id, "No logs yet.");
  const logs = fs.readFileSync(logFile, "utf-8").trim().split("\n");
  const lastLogs = logs.slice(-5).join("\n");
  bot.sendMessage(msg.chat.id, `📋 Last 5 Logs:\n${lastLogs}`);
});

// /setbudget command
bot.onText(/\/setbudget (\d+)/, (msg, match) => {
  const checklist = loadChecklist();
  checklist.savedBudget = parseInt(match[1]);
  saveChecklist(checklist);
  bot.sendMessage(
    msg.chat.id,
    `✅ Saved budget updated to $${checklist.savedBudget.toLocaleString()}`
  );
});

app.get("/", (req, res) => res.send("FinalissimaGoalBot is running..."));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
