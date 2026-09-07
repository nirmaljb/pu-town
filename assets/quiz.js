document.querySelectorAll("[data-quiz]").forEach((quiz) => {
  quiz.addEventListener("submit", (event) => {
    event.preventDefault();
    const selected = new FormData(quiz).get("answer");
    const result = quiz.querySelector("[data-result]");
    const correct = selected === quiz.dataset.correct;

    result.className = `result ${correct ? "correct" : "incorrect"}`;
    result.textContent = selected === null
      ? "Choose an answer first. Retrieval requires a commitment."
      : correct
        ? `Correct — ${quiz.dataset.success}`
        : `Not yet — ${quiz.dataset.hint}`;
  });
});
