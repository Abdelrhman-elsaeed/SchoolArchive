import { buildGraph, computeStats } from "./src/ui/components/graph/buildGraph";
import { buildGraphology, runLayoutSync } from "./src/ui/components/graph/layout";

const mockItems = [
  { documentId: "doc1", originalName: "file1.pdf", category: "شهادات", tags: ["tag1"] },
  { documentId: "doc2", originalName: "file2.pdf", category: "شهادات", tags: ["tag1"] },
];

const data = buildGraph(mockItems as any);
const graph = buildGraphology(data);

let hasNaN = false;
graph.forEachNode((node, attr) => {
  if (Number.isNaN(attr.x) || Number.isNaN(attr.y)) {
    console.error(`Seed NaN for ${node}`, attr);
    hasNaN = true;
  }
});
if (!hasNaN) console.log("Seeds are valid.");

const result = runLayoutSync(graph, 20);
hasNaN = false;
result.graph.forEachNode((node, attr) => {
  if (Number.isNaN(attr.x) || Number.isNaN(attr.y)) {
    console.error(`FA2 NaN for ${node}`, attr);
    hasNaN = true;
  }
});
if (!hasNaN) console.log("FA2 positions are valid.");
