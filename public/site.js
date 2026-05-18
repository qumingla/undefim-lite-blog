const root = document.documentElement;
const modeToggle = document.getElementById("mode-toggle");
const backToTop = document.getElementById("back-to-top");

const storedTheme = localStorage.getItem("blog_theme");
if (storedTheme === "dark") {
  root.classList.add("dark");
}

if (modeToggle) {
  modeToggle.addEventListener("click", () => {
    root.classList.toggle("dark");
    localStorage.setItem("blog_theme", root.classList.contains("dark") ? "dark" : "light");
  });
}

if (backToTop) {
  backToTop.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

document.addEventListener("click", (event) => {
  const bursts = 10;
  for (let index = 0; index < bursts; index += 1) {
    const firework = document.createElement("span");
    firework.className = "firework";
    firework.style.left = `${event.clientX + (Math.random() - 0.5) * 40}px`;
    firework.style.top = `${event.clientY + (Math.random() - 0.5) * 40}px`;
    firework.style.width = `${6 + Math.random() * 8}px`;
    firework.style.height = firework.style.width;
    firework.style.animationDelay = `${index * 14}ms`;
    firework.style.background = `radial-gradient(circle, white 0, hsl(${185 + Math.random() * 45}deg 95% 62%) 72%, transparent 74%)`;
    document.body.appendChild(firework);
    firework.addEventListener("animationend", () => firework.remove(), { once: true });
  }
});

document.querySelectorAll(".card").forEach((card, index) => {
  card.animate(
    [
      { opacity: 0, transform: "translateY(18px)" },
      { opacity: 1, transform: "translateY(0)" }
    ],
    {
      duration: 460,
      easing: "cubic-bezier(.2,.8,.2,1)",
      delay: index * 35,
      fill: "both"
    }
  );
});
