export class WindowsHostLogger {
  info(message) {
    this.write("INFO", message);
  }

  warn(message) {
    this.write("WARN", message);
  }

  error(message) {
    this.write("ERROR", message);
  }

  write(level, message) {
    const stamp = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    console.log(`[${stamp}] [${level}] ${message}`);
  }
}
