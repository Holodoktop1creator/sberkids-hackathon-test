(function () {
  "use strict";

  // Мост к приложению: все сообщения идут через window.postMessage
  const Bridge = {
    send(type) { window.postMessage({ type }, "*"); },
    close() { this.send("CLOSE_EVENT"); },
    finish() { this.send("FINISH_EVENT"); },
    completed() { this.send("COMPLETED_EVENT"); },
    vibrate() { this.send("VIBRATION_EVENT"); },
    share() { this.send("SHARING_EVENT"); },
  };

  const status = document.getElementById("status");
  let score = 0;

  document.getElementById("play").addEventListener("click", () => {
    score += 1;
    status.textContent = "Очки: " + score;
    if (score >= 5) {
      status.textContent = "Ура! Ты прошёл тестовую игру 🎉";
      Bridge.completed();
      Bridge.finish();
      score = 0;
    }
  });
  document.getElementById("vibrate").addEventListener("click", () => Bridge.vibrate());
  document.getElementById("share").addEventListener("click", () => Bridge.share());
  document.getElementById("close").addEventListener("click", () => Bridge.close());
})();
