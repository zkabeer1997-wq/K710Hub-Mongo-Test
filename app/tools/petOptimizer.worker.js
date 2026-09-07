import { createPetPackOptimizer } from "../../lib/petPackOptimizer.mjs";

self.onmessage = ({ data }) => {
  try {
    self.postMessage({ type: "progress", progress: 10 });
    const optimize = createPetPackOptimizer(data.configuration || {});
    const result = optimize(data.inputs);
    self.postMessage({ type: "result", result, progress: 100 });
  } catch (error) {
    self.postMessage({
      type: "error",
      error: error?.message || "Optimization failed.",
    });
  }
};
