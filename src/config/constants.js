/**
 * Application constants
 */

// Calendar polling interval (1 minute)
const POLLING_INTERVAL = 60 * 1000;

// Server port
const SERVER_PORT = 3000;

// Web app URL
const WEB_APP_URL = process.env.WEB_APP_URL || 'http://localhost:3000';

// Emoji list for gratitude selection
const EMOJI_LIST = ['🙏', '👏', '🎉', '❤️', '💪', '🔥', '✨', '👍', '🌟', '💯'];

// Event code character set
const EVENT_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

// Event code length range
const EVENT_CODE_MIN_LENGTH = 6;
const EVENT_CODE_MAX_LENGTH = 8;

// Keywords for identifying appreciate events
const APPRECIATE_KEYWORDS = {
  title: ['社内イベント'],
  description: ['#appreciate', '#ありがとう']
};

// Tray icon fallback (base64 encoded pink circle)
const TRAY_ICON_FALLBACK = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAA' +
  'gElEQVQ4T2NkoBAwUqifYdQAhtEwYBgeBv9RYoARl5ewGfAfQ+P/DAwM/0E0I7oBjP8Z' +
  'GP7jMgSbZkZGBgZGRgYGRmyasamBuQKrAbgMwWYIIw5XEDQAZgg2Q4hyBS5DiHYFLkOI' +
  'dgU+Q0hyBTZDSHYFpgEku4IYQ0hOC4QMAQC4HTARCwGnQgAAAABJRU5ErkJggg==';

module.exports = {
  POLLING_INTERVAL,
  SERVER_PORT,
  WEB_APP_URL,
  EMOJI_LIST,
  EVENT_CODE_CHARS,
  EVENT_CODE_MIN_LENGTH,
  EVENT_CODE_MAX_LENGTH,
  APPRECIATE_KEYWORDS,
  TRAY_ICON_FALLBACK
};
