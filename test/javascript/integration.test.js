const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

function loadIntegration({ readyState = 'complete', attachmentInput = {}, createError } = {}) {
  const listeners = new Map();
  const textareas = new Map();
  const createdConfigs = [];
  const destroyedEditors = [];
  const previews = [];
  const timers = new Map();
  let nextTimer = 0;
  const emitter = () => {
    const callbacks = new Map();
    return {
      on(name, callback) {
        if (!callbacks.has(name)) callbacks.set(name, new Set());
        callbacks.get(name).add(callback);
      },
      off(name, callback) {
        callbacks.get(name)?.delete(callback);
      },
      fire(name, ...args) {
        callbacks.get(name)?.forEach(callback => callback(...args));
      }
    };
  };
  const classList = (...initial) => {
    const classes = new Set(initial);
    return {
      add: value => classes.add(value),
      contains: value => classes.has(value),
      remove: value => classes.delete(value)
    };
  };
  const formEvents = emitter();
  const form = {
    addEventListener: formEvents.on,
    removeEventListener: formEvents.off,
    append() {},
    querySelector(selector) {
      if (selector.startsWith('.attachments_form')) return attachmentInput;
      return null;
    }
  };

  const elements = [];
  function element() {
    const properties = new Map();
    const node = {
      children: [],
      hidden: false,
      style: { setProperty: (name, value) => properties.set(name, value), properties },
      appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
      remove() { this.removed = true; }
    };
    elements.push(node);
    return node;
  }

  global.document = {
    body: element(),
    readyState,
    baseURI: 'https://redmine.example/',
    addEventListener(name, callback) {
      listeners.set(name, callback);
    },
    createElement(name) {
      if (name !== 'template') return element();
      return {
        content: { querySelectorAll: () => [] },
        innerHTML: ''
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
    setTimeout(callback, delay) {
      assert.equal(delay, 150);
      timers.set(++nextTimer, callback);
      return nextTimer;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
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
      createShadowRoot(host) {
        host.shadowRoot = element();
        host.shadowRoot.host = host;
        host.shadowRoot.mode = 'open';
        return host.shadowRoot;
      },
      plugins: [],
      RedmineUpload() {},
      ClassicEditor: {
        async create(config) {
          if (createError) throw createError;
          createdConfigs.push(config);
          const editor = {
            ...emitter(),
            sourceElement: config.attachTo,
            _data: config.initialData,
            dataReads: 0,
            commands: { get: () => null },
            editing: { view: { focus() {} } },
            getData() {
              this.dataReads++;
              return this._data;
            },
            setData(data) {
              this._data = data;
              this.model.document.fire('change:data');
            },
            model: { document: emitter() },
            plugins: { get: () => ({}) },
            ui: {
              focusTracker: emitter(),
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
              this.fire('destroy');
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

  function addTextarea(id, value = '') {
    const textarea = {
      dataset: {},
      hidden: false,
      isConnected: true,
      value,
      name: 'issue[notes]',
      events: [],
      dispatchEvent(event) { this.events.push(event.type); },
      matches(selector) {
        assert.equal(selector, ':disabled');
        return this.disabled || this.inDisabledFieldset;
      },
      after(node) { this.nextElementSibling = node; },
      closest(selector) {
        return selector === 'form' ? form : null;
      }
    };
    textareas.set(id, textarea);
    return textarea;
  }

  return {
    addTextarea,
    elements,
    createdConfigs,
    destroyedEditors,
    previews,
    fireForm: formEvents.fire,
    runTimers() {
      const callbacks = [...timers.values()];
      timers.clear();
      callbacks.forEach(callback => callback());
    },
    timers,
    fire(name, ...args) {
      document.readyState = 'complete';
      return listeners.get(name)?.(...args);
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
  assert.equal(editor._redmineHost.hidden, true);
  assert.equal(preview.preview.classList.contains('hidden'), false);

  preview.editTab.onclick({ target: preview.editTab.firstChild });
  assert.equal(editor._redmineHost.hidden, false);
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
  assert.equal(secondEditor._redmineTextarea, secondTextarea);
  assert.equal(firstEditor._redmineHost.removed, true);
  assert.deepEqual(environment.destroyedEditors, [firstEditor]);
  assert.equal(environment.createdConfigs.length, 2);
});

test('coalesces rapid edits without serializing data on the editing path', async () => {
  const environment = loadIntegration();
  const textarea = environment.addTextarea('issue_notes', '<p>Initial</p>');
  const editor = await environment.integration.replace('issue_notes', {});
  const initialReads = editor.dataReads;

  for (let i = 0; i < 40; i++) editor.setData(`<p>Edit ${i}</p>`);

  assert.equal(editor.dataReads, initialReads);
  assert.equal(textarea.value, '<p>Initial</p>');
  assert.equal(environment.timers.size, 1);

  environment.runTimers();
  assert.equal(editor.dataReads, initialReads + 1);
  assert.equal(textarea.value, '<p>Edit 39</p>');
  assert.deepEqual(textarea.events, ['input']);

  editor.model.document.fire('change:data');
  environment.runTimers();
  assert.deepEqual(textarea.events, ['input']);
});

test('preview flushes the latest edit and cancels deferred synchronization', async () => {
  const environment = loadIntegration();
  const textarea = environment.addTextarea('issue_notes');
  const editor = await environment.integration.replace('issue_notes', {
    redminePreviewUrl: '/issues/1/preview'
  });
  editor.setData('<p>Latest preview</p>');
  const preview = environment.previews[0];
  preview.previewTab.onclick({ target: preview.previewTab.firstChild });

  assert.equal(textarea.value, '<p>Latest preview</p>');
  assert.equal(environment.timers.size, 0);
});

test('submission flushes pending edits and resets the unsaved data baseline', async () => {
  const environment = loadIntegration();
  const textarea = environment.addTextarea('issue_notes');
  const editor = await environment.integration.replace('issue_notes', {});
  editor.setData('<p>Submit immediately</p>');
  environment.fireForm('submit');

  assert.equal(textarea.value, '<p>Submit immediately</p>');
  assert.equal(editor._redmineInitialData, textarea.value);
  assert.equal(environment.timers.size, 0);
  assert.equal(editor.dataReads, 2);
});

test('FormData receives pending edits without marking the form as saved', async () => {
  const environment = loadIntegration();
  const textarea = environment.addTextarea('issue_notes', '<p>Initial</p>');
  const editor = await environment.integration.replace('issue_notes', {});
  editor.setData('<p>Capture immediately</p>');
  const formData = new FormData();
  formData.set(textarea.name, textarea.value);
  environment.fireForm('formdata', { formData });

  assert.equal(formData.get(textarea.name), '<p>Capture immediately</p>');
  assert.equal(editor._redmineInitialData, '<p>Initial</p>');
  assert.equal(environment.timers.size, 0);

  textarea.disabled = true;
  const disabledFormData = new FormData();
  environment.fireForm('formdata', { formData: disabledFormData });
  assert.equal(disabledFormData.has(textarea.name), false);

  textarea.disabled = false;
  textarea.inDisabledFieldset = true;
  environment.fireForm('formdata', { formData: disabledFormData });
  assert.equal(disabledFormData.has(textarea.name), false);
});

test('losing editor focus flushes pending edits', async () => {
  const environment = loadIntegration();
  const textarea = environment.addTextarea('issue_notes');
  const editor = await environment.integration.replace('issue_notes', {});
  editor.setData('<p>Blur immediately</p>');
  editor.ui.focusTracker.fire('change:isFocused', {}, 'isFocused', false);

  assert.equal(textarea.value, '<p>Blur immediately</p>');
  assert.equal(environment.timers.size, 0);
});

test('programmatic content updates synchronize immediately', async () => {
  const environment = loadIntegration();
  const textarea = environment.addTextarea('issue_notes');
  await environment.integration.replace('issue_notes', {});
  await environment.integration.setData('issue_notes', '<p>Quoted journal</p>');

  assert.equal(textarea.value, '<p>Quoted journal</p>');
  assert.equal(environment.timers.size, 0);
});

test('warns about unsaved edits before the deferred update has run', async () => {
  const environment = loadIntegration();
  environment.addTextarea('issue_notes');
  const editor = await environment.integration.replace('issue_notes', {});
  editor.setData('<p>Unsaved</p>');
  let prevented = false;
  const event = { preventDefault() { prevented = true; } };
  environment.fire('beforeunload', event);

  assert.equal(prevented, true);
  assert.equal(event.returnValue, '');
});

test('AJAX replacement cancels old updates and removes stale form listeners', async () => {
  const environment = loadIntegration();
  const textarea = environment.addTextarea('issue_notes');
  const oldEditor = await environment.integration.replace('issue_notes', {});
  oldEditor.setData('<p>Stale</p>');
  textarea.isConnected = false;
  const replacement = environment.addTextarea('issue_notes', '<p>Replacement</p>');
  await environment.integration.replace('issue_notes', {});
  const oldReads = oldEditor.dataReads;

  environment.runTimers();
  oldEditor.model.document.fire('change:data');
  oldEditor.ui.focusTracker.fire('change:isFocused', {}, 'isFocused', false);
  environment.fireForm('submit');
  const formData = new FormData();
  environment.fireForm('formdata', { formData });

  assert.equal(environment.timers.size, 0);
  assert.equal(oldEditor.dataReads, oldReads);
  assert.equal(formData.get(replacement.name), '<p>Replacement</p>');
});

test('mounts the editor and floating UI separately while retaining the form field', async () => {
  const environment = loadIntegration();
  const textarea = environment.addTextarea('issue_notes', '<p>Initial</p>');
  const editor = await environment.integration.replace('issue_notes', {
    ui: { viewportOffset: { top: 30 } },
    redmineUpload: { uploadUrl: '/uploads' },
    redmineHeight: 400,
    redmineWidth: '90%',
    redmineUiColor: '#abcdef'
  });
  const config = environment.createdConfigs[0];
  const host = editor._redmineHost;
  const overlayHost = config.ui.overlayContainer.host;
  assert.equal(editor.sourceElement, host.shadowRoot.children[0]);
  assert.equal(host.shadowRoot.mode, 'open');
  assert.notEqual(config.ui.overlayContainer, host.shadowRoot);
  assert.equal(overlayHost.parentNode, document.body);
  assert.equal(config.ui.viewportOffset.top, 30);
  assert.equal(config.redmineUpload.sourceElement, textarea);
  assert.equal(config.redmineUpload.uploadUrl, '/uploads');
  assert.equal(config.initialData, '<p>Initial</p>');
  assert.equal(textarea.hidden, true);
  assert.equal(host.style.width, '90%');
  assert.equal(host.style.properties.get('--redmine-ckeditor-height'), '400px');
  for (const node of [host, overlayHost]) {
    assert.equal(node.style.properties.get('--ck-color-base-background'), '#abcdef');
  }
  assert.equal(await environment.integration.replace('issue_notes', {}), editor);
  assert.equal(environment.createdConfigs.length, 1);

  editor.setData('<p>Last edit</p>');
  await environment.integration.destroy('issue_notes');
  assert.equal(textarea.value, '<p>Last edit</p>');
  assert.equal(textarea.hidden, false);
  assert.equal(textarea.dataset.ckeditor5Active, undefined);
  assert.equal(host.removed, true);
  assert.equal(overlayHost.removed, true);
  assert.equal(environment.integration.editorFor('issue_notes'), undefined);
});

test('restores the textarea and removes shadow hosts when initialization fails', async () => {
  const environment = loadIntegration({ createError: new Error('Invalid license') });
  const textarea = environment.addTextarea('issue_notes', '<p>Keep this</p>');
  const originalError = console.error;
  console.error = () => {};
  try {
    await assert.rejects(environment.integration.replace('issue_notes', {}), /Invalid license/);
  } finally {
    console.error = originalError;
  }
  assert.equal(textarea.hidden, false);
  assert.equal(textarea.value, '<p>Keep this</p>');
  const hosts = environment.elements.filter(node => node.className?.startsWith('redmine-ckeditor-') && !node.className.endsWith('error'));
  assert.equal(hosts.length, 2);
  assert.equal(hosts.every(node => node.removed), true);
  assert.equal(environment.integration.editorFor('issue_notes'), undefined);
});
