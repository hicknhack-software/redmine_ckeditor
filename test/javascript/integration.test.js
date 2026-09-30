const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

function loadIntegration({ readyState = 'complete', attachmentInput = {} } = {}) {
  const listeners = new Map();
  const textareas = new Map();
  const createdConfigs = [];
  const destroyedEditors = [];
  const previews = [];
  const classList = (...initial) => {
    const classes = new Set(initial);
    return {
      add: value => classes.add(value),
      contains: value => classes.has(value),
      remove: value => classes.delete(value)
    };
  };
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
    jsToolBar: class {
      constructor(textarea) {
        this.textarea = textarea;
        this.editTab = { firstChild: { classList: classList('selected') } };
        this.previewTab = { firstChild: { classList: classList() } };
        this.preview = { classList: classList('hidden'), style: {} };
        this.toolbar = { classList: classList() };
        previews.push(this);
      }

      setPreviewUrl(url) {
        this.previewUrl = url;
      }
    },
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
              getEditableElement: () => ({ clientHeight: 240 }),
              view: {
                element: {
                  classList: classList(),
                  hidden: false,
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
    previews,
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

test('uses Redmine server preview and keeps custom options away from CKEditor', async () => {
  const environment = loadIntegration();
  const textarea = environment.addTextarea('issue_notes');
  textarea.dispatchEvent = () => {};
  const editor = await environment.integration.replace('issue_notes', {
    redminePreviewUrl: '/issues/1/preview'
  });

  const preview = environment.previews[0];
  assert.equal(preview.previewUrl, '/issues/1/preview');
  assert.equal(environment.createdConfigs[0].redminePreviewUrl, undefined);

  editor._data = '<p>Preview me</p>';
  preview.previewTab.onclick({ target: preview.previewTab.firstChild });
  assert.equal(textarea.value, '<p>Preview me</p>');
  assert.equal(editor.ui.view.element.hidden, true);
  assert.equal(preview.preview.classList.contains('hidden'), false);

  preview.editTab.onclick({ target: preview.editTab.firstChild });
  assert.equal(editor.ui.view.element.hidden, false);
  assert.equal(preview.preview.classList.contains('hidden'), true);
});

test('recreates an editor when Redmine replaces its form through AJAX', async () => {
  const environment = loadIntegration();
  const firstTextarea = environment.addTextarea('journal_1_notes');
  const firstEditor = await environment.integration.replace('journal_1_notes', {});

  firstTextarea.isConnected = false;
  const secondTextarea = environment.addTextarea('journal_1_notes');
  const secondEditor = await environment.integration.replace('journal_1_notes', {});

  assert.notEqual(secondEditor, firstEditor);
  assert.equal(secondEditor.sourceElement, secondTextarea);
  assert.deepEqual(environment.destroyedEditors, [firstEditor]);
  assert.equal(environment.createdConfigs.length, 2);
});
