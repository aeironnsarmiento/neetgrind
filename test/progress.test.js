import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCapture, isAcceptedResponse, isSolved } from "../src/data/neetcodeProgress.js";

const API = "https://neetcode.io/api";
const call = (functionId, extra = {}, data = null, status = 200) => ({
  url: `${API}/callableFunctionHttp`,
  body: JSON.stringify({ data: { functionId, ...extra } }),
  status,
  text: JSON.stringify({ data }),
  path: "/roadmap",
});
const submit = (problemId, data, path = `/problems/${problemId}/question`) => ({
  url: `${API}/executeCodeFunctionHttp`,
  body: JSON.stringify({ data: { problemId, rawCode: "x", lang: "python" } }),
  status: 200,
  text: JSON.stringify({ data }),
  path,
});
const q = (slug, ncLink = null) => ({ slug, ncLink, leetcodeOnly: false });

test("getCompletedProblems replaces the list but keeps editor solves and unticks", () => {
  const before = {
    server: null,
    marks: { "two-sum": { done: false, at: "1" }, "valid-anagram": { done: true, at: "1" } },
    accepted: { "two-integer-sum": "1" },
  };
  const next = applyCapture(before, call("getCompletedProblems", {}, { "Arrays & Hashing": ["two-sum/", "contains-duplicate/"] }), "2");
  assert.deepEqual(next, {
    server: { at: "2", slugs: ["two-sum", "contains-duplicate"] },
    marks: { "two-sum": { done: false, at: "1" } },
    accepted: { "two-integer-sum": "1" },
  });
});

test("checkbox clicks are recorded by LeetCode slug", () => {
  let s = applyCapture(null, call("markProblemComplete", { topic: "Arrays & Hashing", problem: "two-sum/" }), "1");
  assert.deepEqual(s.marks["two-sum"], { done: true, at: "1" });
  s = applyCapture(s, call("markProblemIncomplete", { topic: "Arrays & Hashing", problem: "two-sum/" }), "2");
  assert.deepEqual(s.marks["two-sum"], { done: false, at: "2" });
});

test("accepted submissions are recorded by problem id and page slug", () => {
  const s = applyCapture(null, submit("two-integer-sum", { status: "Accepted" }), "1");
  assert.deepEqual(s.accepted, { "two-integer-sum": "1" });
  const other = applyCapture(null, submit("abc123", { verdict: "Accepted" }, "/problems/two-integer-sum/question"), "1");
  assert.deepEqual(other.accepted, { abc123: "1", "two-integer-sum": "1" });
});

test("failed submissions, other calls and errors are ignored", () => {
  assert.equal(applyCapture(null, submit("p", { status: "Wrong Answer" })), null);
  assert.equal(applyCapture(null, call("getActiveSaleCampaign", {}, { campaign: null })), null);
  assert.equal(applyCapture(null, call("getCompletedProblems", {}, {}, 500)), null);
});

test("isAcceptedResponse", () => {
  assert.equal(isAcceptedResponse({ result: { status: "Accepted" } }), true);
  assert.equal(isAcceptedResponse({ accepted: true }), true);
  assert.equal(isAcceptedResponse({ accepted: false, tests: [{ status: "Accepted" }] }), false);
  assert.equal(isAcceptedResponse({ status: "Wrong Answer", tests: [{ status: "Accepted" }] }), false);
  assert.equal(isAcceptedResponse({ status: "Runtime Error" }), false);
  assert.equal(isAcceptedResponse(null), false);
});

test("isSolved", () => {
  const ls = new Set(["two-sum"]);
  const tsq = q("two-sum", "two-integer-sum");
  // localStorage only until the first list is seen
  assert.equal(isSolved(tsq, null, ls), true);
  const snap = { server: { at: "5", slugs: [] }, marks: {}, accepted: {} };
  assert.equal(isSolved(tsq, snap, ls), false);
  // an editor solve survives a newer list that doesn't include it (the refresh bug)
  assert.equal(isSolved(tsq, { ...snap, accepted: { "two-integer-sum": "2" } }, ls), true);
  // ...until it's unticked later, even after another list arrives
  const unticked = { ...snap, accepted: { "two-integer-sum": "2" }, marks: { "two-sum": { done: false, at: "3" } } };
  assert.equal(isSolved(tsq, unticked, ls), false);
  assert.equal(isSolved(tsq, { ...unticked, accepted: { "two-integer-sum": "4" } }, ls), true);
  // an old untick loses to a newer list that has it ticked
  assert.equal(isSolved(tsq, { server: { at: "5", slugs: ["two-sum"] }, marks: { "two-sum": { done: false, at: "3" } }, accepted: {} }, ls), true);
  // lists that use NeetCode ids still match
  assert.equal(isSolved(tsq, { server: { at: "5", slugs: ["two-integer-sum"] }, marks: {}, accepted: {} }, ls), true);
});
