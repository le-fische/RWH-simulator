# Rainwater Harvesting (RWH) System 3D Simulator

A web-based, interactive 3D simulation and visualization tool designed to model, test, and evaluate rainwater harvesting systems. This tool assists in designing sustainable water treatment and storage solutions for remote communities, allowing users to analyze the performance, cost, and environmental impact of various hardware configurations.

**Live Demo / Quick Access:** [https://le-fische.github.io/RWH-simulator/](https://le-fische.github.io/RWH-simulator/) 

---

## 🚨 Academic Integrity & Usage Notice

**This tool is strictly designed as a testing, visualization, and decision-support environment.** To strictly uphold academic integrity and ensure compliance with university engineering project guidelines:
1. **No Auto-Solvers:** This simulator **does not** contain auto-solvers, "maximize" functions, or generative AI optimization features. 
2. **Manual Configuration:** Users must manually configure their systems, run their own analyses, and justify their design decisions based on the outputted metrics. 
3. **Verification:** The data matrix provides a mathematical breakdown, but students are expected to verify physical and hydraulic behavior with their own hand-calculations and system knowledge.
4. **Original Work:** It is intended to complement your learning process, not replace it. If you utilize visualizations or data matrices from this tool in your reports, ensure you cite the tool appropriately according to your course's referencing guidelines.

---

## 🚀 Features

* **Interactive 3D Visualization:** Powered by Three.js, view your system layout on a dynamically generated 3D terrain. Includes day/night toggles and drag-and-drop component placement.
* **Custom Data Ingestion:** Upload specific Terrain CSV and historical Rain Data CSVs (e.g., 2013, 2014, 2015 data) to test systems against real-world geographical and meteorological conditions.
* **Dynamic System Configuration:** Adjust dozens of parameters in real-time, including:
  * Roof and additional catchment areas
  * Storage and catchment tank volumes (and optional water towers)
  * Pump models and filtration locations
  * Chemical treatment (Chlorine vs. Ozone) and UV purification
  * Power sources (Solar panel arrays vs. Diesel generators)
* **Real-Time Performance Metrics:** Instantly calculates comprehensive system scores based on adjustable weightings for Consumption, Cost, Risk, GHG Emissions, Maintenance, Reliability, and Flow Rate.
* **Detailed Data Matrix:** Access a complete, transparent breakdown of Capital Expenditures (CapEx), Operating Expenses (OpEx), hydraulic physics, and environmental risk profiles.

## 🛠️ Technologies Used

* **Frontend:** HTML5, CSS3 (with CSS variables for light/dark theming)
* **Logic/Simulation:** Vanilla JavaScript (ES6+)
* **3D Graphics:** [Three.js](https://threejs.org/)
* **Backend / Local Server:** Node.js (for local file serving and bypassing CORS security restrictions on CSV loads)

## 📂 Project Structure

* `server.js` / `package.json` - A lightweight Node.js local server to serve static files and prevent local CORS policy errors when fetching data.
* `index.html` - The main application entry point and UI layout.
* `styles.css` - Custom styling, UI themes (light/dark mode), and responsive design.
* `app.js` - UI logic, event listeners, DOM manipulation, and data binding.
* `simulation.js` - The core physics, cost, and performance simulation engine (`RWHSimulation` class).
* `visualizer.js` - The 3D rendering engine and scene management (`RWHVisualizer` class).
* `/data/` - Directory containing the necessary `terrain.csv` and historical rain data CSVs (2013, 2014, 2015).

## 💻 Installation & Setup

To ensure the 3D engine and local CSV files load correctly without browser cross-origin (CORS) restrictions, this project uses a lightweight Node.js server.

1. **Install Node.js:** Ensure you have [Node.js](https://nodejs.org/) installed on your machine.
2. **Clone the Repository:**
   ```bash
   git clone [https://github.com/le-fische/RWH-simulator.git](https://github.com/le-fische/RWH-simulator.git)
   cd RWH-simulator
