import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initStore } from "./lib/memoryStore";

if (!window.location.hash) {
  window.location.hash = "#/";
}

// Initialize the store (loads from IndexedDB if available) before rendering
// This ensures data is ready before the first query fires
initStore().finally(() => {
  createRoot(document.getElementById("root")!).render(<App />);
});
