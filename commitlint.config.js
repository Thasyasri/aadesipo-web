export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Matches the coding standard: feat(engine): add auction FSM
    "scope-empty": [1, "never"],
  },
};
