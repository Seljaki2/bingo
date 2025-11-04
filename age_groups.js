async function loadAgeGroups() {
    const container = document.getElementById("grade-cards");
    const startBtn = document.getElementById("start-game");
    let selectedId = null;

    const ageGroups = (await window.api.loadMenu()).ageGroups;

    if (ageGroups.error) {
        container.innerHTML = `<p class="text-red-500">Error: ${ageGroups.error}</p>`;
        return;
    }

    container.innerHTML = "";

    ageGroups.forEach(group => {
        const card = document.createElement("div");
        card.className =
            "p-4 border-2 border-gray-200 rounded-xl cursor-pointer bg-white transition-all hover:scale-105 hover:shadow-lg";
        card.innerHTML = `
      <h3 class="font-semibold text-lg mb-1">${group.age_group}</h3>
      <p class="text-sm text-gray-500">Ages ${group.min_age}–${group.max_age}</p>
    `;

        card.addEventListener("click", () => {
            selectedId = group.id;

            document.querySelectorAll("#grade-cards > div").forEach(el => {
                el.classList.remove("border-blue-500", "bg-blue-50", "shadow-md");
                el.classList.add("border-gray-200", "bg-white");
            });

            card.classList.add("border-blue-500", "bg-blue-50", "shadow-md");

            startBtn.disabled = false;
            startBtn.classList.remove("bg-gray-300", "cursor-not-allowed");
            startBtn.classList.add("bg-blue-600", "hover:bg-blue-700");
        });

        container.appendChild(card);
    });

    startBtn.addEventListener("click", () => {
        if (selectedId) {
            console.log("Selected Age Group ID:", selectedId);
            window.location.href = "game.html";
        }
    });
}

document.addEventListener("DOMContentLoaded", loadAgeGroups);
