import { compose } from "react-declarative";
import { throttle } from "lodash";
import { localeChangedSubject } from "./t";

const MUTATION_DEBOUNCE = 1;

const mutations: Function[] = [
  () => {
    document.querySelectorAll("input").forEach((input) => {
      if (input.placeholder) {
        if (!input.dataset.originalPlaceholder) {
          input.dataset.originalPlaceholder = input.placeholder;
        }
        input.placeholder = window.Translate.translateText(input.dataset.originalPlaceholder);
      }
    });
  },

  () => {
    document.querySelectorAll("textarea").forEach((textarea) => {
      if (textarea.placeholder) {
        if (!textarea.dataset.originalPlaceholder) {
          textarea.dataset.originalPlaceholder = textarea.placeholder;
        }
        textarea.placeholder = window.Translate.translateText(
          textarea.dataset.originalPlaceholder,
        );
      }
    });
  },
];

const dom_patch = () => {
  const pipeline = throttle(
    compose(...mutations.map((callback) => () => void callback())),
    MUTATION_DEBOUNCE,
    {
      trailing: true,
    },
  );

  const observer = new MutationObserver(pipeline);

  localeChangedSubject.subscribe(pipeline);

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
};

document.addEventListener("DOMContentLoaded", dom_patch);


