const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

function loadIntegration({ readyState = 'complete', attachmentInput = {} } = {}) {
  const listeners = new Map();
  const textareas = new Map();
  const createdConfigs = [];
  const destroyedEditors = [];
  const form = {
    addEventListener() {},
    append() {},
    querySelector(selector) {
      if (selector.startsWith('.attachments_form')) return attachmentInput;
      return null;
    }
  };

  global.document = {
    readyState,
    baseURI: 'https://redmine.example/',
    addEventListener(name, callback) {
      listeners.set(name, callback);
    },
    createElement(name) {
      assert.equal(name, 'template');
      return {
        content: { querySelectorAll: () => [] },
        set innerHTML(_value) {}
      };
    },
    getElementById(id) {
      return textareas.get(id);
    },
    querySelector() {
      return null;
    }
  };

  global.window = {
    addEventListener(name, callback) {
      listeners.set(name, callback);
    },
    location: { origin: 'https://redmine.example' },
    RedmineCKEditor5: {
      plugins: [],
      RedmineUpload() {},
      ClassicEditor: {
        async create(textarea, config) {
          createdConfigs.push(config);
          const editor = {
            sourceElement: textarea,
            _data: textarea.value,
            commands: { get: () => null },
            editing: { view: { focus() {} } },
            getData() { return this._data; },
            model: { document: { on() {} } },
            plugins: { get: () => ({}) },
            ui: {
              view: {
                element: {
                  classList: { add() {} },
                  style: { setProperty() {} }
                }
              }
            },
            async destroy() {
              destroyedEditors.push(this);
            }
          };
          return editor;
        }
      }
    }
  };

  const integrationPath = path.resolve(__dirname, '../../assets/javascripts/integration.js');
  delete require.cache[integrationPath];
  require(integrationPath);

  function addTextarea(id) {
    const textarea = {
      dataset: {},
      hidden: false,
      isConnected: true,
      value: '',
      after() {},
      closest(selector) {
        return selector === 'form' ? form : null;
      }
    };
    textareas.set(id, textarea);
    return textarea;
  }

  return {
    addTextarea,
    createdConfigs,
    destroyedEditors,
    fire(name) {
      document.readyState = 'complete';
      return listeners.get(name)?.();
    },
    integration: window.RedmineCKEditor
  };
}

test('waits for the full issue form before checking upload support', async () => {
  const environment = loadIntegration({ readyState: 'loading' });
  environment.addTextarea('issue_notes');

  const replacement = environment.integration.replace('issue_notes', {
    toolbar: { items: ['bold', 'uploadImage'] }
  });
  assert.equal(environment.createdConfigs.length, 0);

  environment.fire('DOMContentLoaded');
  await replacement;

  assert.deepEqual(environment.createdConfigs[0].toolbar.items, ['bold', 'uploadImage']);
});
