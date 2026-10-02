(function(window, document) {
  'use strict';

  const instances = new Map();
  const pending = new Map();

  function editorFor(id) {
    return instances.get(id);
  }

  function sync(editor, textarea) {
    const data = editor.getData();
    if (textarea.value !== data) {
      textarea.value = data;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return data;
  }

  function connectSync(editor, textarea) {
    let timer;
    const form = textarea.closest('form');
    const cancel = () => {
      window.clearTimeout(timer);
      timer = undefined;
    };
    const flush = () => {
      cancel();
      return sync(editor, textarea);
    };
    const schedule = () => {
      cancel();
      // Serializing a table-heavy document on every keystroke blocks editing.
      // Keep the backing field current after a short pause instead.
      timer = window.setTimeout(flush, 150);
    };
    const onBlur = (_event, _name, isFocused) => {
      if (!isFocused) flush();
    };
    const onSubmit = () => {
      editor._redmineInitialData = flush();
    };
    const onFormData = event => {
      // FormData has already captured the fields when this event fires.
      const data = flush();
      if (textarea.name && !textarea.matches(':disabled')) event.formData.set(textarea.name, data);
    };

    editor.model.document.on('change:data', schedule);
    editor.ui.focusTracker.on('change:isFocused', onBlur);
    form?.addEventListener('submit', onSubmit);
    form?.addEventListener('formdata', onFormData);
    editor.on('destroy', () => {
      cancel();
      editor.model.document.off('change:data', schedule);
      editor.ui.focusTracker.off('change:isFocused', onBlur);
      form?.removeEventListener('submit', onSubmit);
      form?.removeEventListener('formdata', onFormData);
    });
    editor._redmineFlush = flush;
  }

  function createPreview(textarea, previewUrl) {
    if (!previewUrl || typeof window.jsToolBar !== 'function') return;

    const toolbar = new window.jsToolBar(textarea);
    toolbar.setPreviewUrl(previewUrl);
    return toolbar;
  }

  function connectPreview(toolbar, editor, textarea) {
    if (!toolbar) return;

    const editorElement = editor.ui.view.element;
    const editLink = toolbar.editTab.firstChild;
    const previewLink = toolbar.previewTab.firstChild;

    toolbar.previewTab.onclick = event => {
      if (event.target.classList.contains('selected')) return false;

      editor._redmineFlush();
      const editable = editor.ui.getEditableElement?.();
      if (editable?.clientHeight) toolbar.preview.style.minHeight = `${editable.clientHeight}px`;
      toolbar.toolbar.classList.add('hidden');
      editorElement.hidden = true;
      toolbar.preview.classList.remove('hidden');
      editLink.classList.remove('selected');
      previewLink.classList.add('selected');
      return false;
    };

    toolbar.editTab.onclick = event => {
      if (event.target.classList.contains('selected')) return false;

      toolbar.toolbar.classList.remove('hidden');
      editorElement.hidden = false;
      toolbar.preview.classList.add('hidden');
      previewLink.classList.remove('selected');
      editLink.classList.add('selected');
      editor.editing.view.focus();
      return false;
    };
  }

  function normalizeAttachmentImageUrls(html) {
    const content = document.createElement('template');
    content.innerHTML = html || '';

    content.content.querySelectorAll('img[src]').forEach(image => {
      const source = image.getAttribute('src');
      let url;
      try {
        url = new URL(source, document.baseURI);
      } catch (_error) {
        return;
      }
      if (url.origin !== window.location.origin) return;

      const pathname = url.pathname.replace(
        /\/attachments\/(?!download\/)(\d+)(?=\/|$)/,
        '/attachments/download/$1'
      );
      if (pathname === url.pathname) return;

      image.setAttribute('src', `${pathname}${url.search}${url.hash}`);
    });

    return content.innerHTML;
  }

  async function replace(id, options) {
    // Redmine renders the editor initialization script next to the textarea,
    // while attachment fields can occur later in the same form. Wait until the
    // initial document is complete before deciding whether uploads are
    // available. Scripts inserted later through AJAX run immediately.
    if (document.readyState === 'loading') {
      return new Promise((resolve, reject) => {
        document.addEventListener(
          'DOMContentLoaded',
          () => replace(id, options).then(resolve, reject),
          { once: true }
        );
      });
    }

    const textarea = document.getElementById(id);
    if (!textarea) return;

    const existing = instances.get(id);
    if (existing) {
      if (existing.sourceElement === textarea && textarea.isConnected) return existing;
      await destroy(id);
    }

    const creating = pending.get(id);
    if (creating) {
      const editor = await creating;
      if (editor.sourceElement === textarea && textarea.isConnected) return editor;
      await destroy(id);
    }

    const bundle = window.RedmineCKEditor5;
    if (!bundle) throw new Error('The CKEditor 5 bundle was not loaded.');

    textarea.value = normalizeAttachmentImageUrls(textarea.value);

    const config = Object.assign({}, options || {}, {
      plugins: bundle.plugins,
      extraPlugins: [bundle.RedmineUpload]
    });
    if (config.htmlSupport?.allow) {
      config.htmlSupport.allow = config.htmlSupport.allow.map(rule =>
        rule.name === '$all' ? Object.assign({}, rule, { name: /.*/ }) : rule
      );
    }
    const preview = createPreview(textarea, config.redminePreviewUrl);
    delete config.redminePreviewUrl;
    const supportsAttachments = textarea.closest('form')
      ?.querySelector('.attachments_form input[type="file"][name^="attachments["]');
    if (!supportsAttachments && Array.isArray(config.toolbar?.items)) {
      config.toolbar.items = config.toolbar.items.filter(item => item !== 'uploadImage');
    }
    const height = config.redmineHeight;
    const width = config.redmineWidth;
    const uiColor = config.redmineUiColor;
    const showBlocks = config.redmineShowBlocks;
    delete config.redmineHeight;
    delete config.redmineWidth;
    delete config.redmineUiColor;
    delete config.redmineShowBlocks;

    const promise = bundle.ClassicEditor.create(textarea, config).then(editor => {
      pending.delete(id);
      instances.set(id, editor);
      editor.sourceElement.dataset.ckeditor5Active = 'true';
      editor.ui.view.element.classList.add('redmine-ckeditor-wrapper');
      connectPreview(preview, editor, textarea);
      if (height) editor.ui.view.element.style.setProperty('--redmine-ckeditor-height', `${parseInt(height, 10)}px`);
      if (width) editor.ui.view.element.style.width = /^\d+(?:\.\d+)?$/.test(width) ? `${width}px` : width;
      if (uiColor) {
        editor.ui.view.element.style.setProperty('--ck-color-base-background', uiColor);
        editor.ui.view.element.style.setProperty('--ck-color-toolbar-background', uiColor);
      }
      if (showBlocks && editor.commands.get('showBlocks') && !editor.commands.get('showBlocks').value) {
        editor.execute('showBlocks');
      }

      connectSync(editor, textarea);
      editor._redmineInitialData = editor.getData();
      return editor;
    }).catch(error => {
      pending.delete(id);
      textarea.hidden = false;
      const message = document.createElement('div');
      message.className = 'redmine-ckeditor-error';
      message.textContent = `CKEditor could not start: ${error.message}`;
      textarea.after(message);
      console.error(error);
      throw error;
    });

    pending.set(id, promise);
    return promise;
  }

  async function destroy(id) {
    const editor = instances.get(id) || await pending.get(id);
    if (!editor) return;
    instances.delete(id);
    pending.delete(id);
    await editor.destroy();
  }

  async function setData(id, data) {
    const editor = instances.get(id) || await pending.get(id);
    const normalizedData = normalizeAttachmentImageUrls(data);
    if (editor) {
      editor.setData(normalizedData);
      editor._redmineFlush();
    } else {
      const textarea = document.getElementById(id);
      if (textarea) textarea.value = normalizedData;
    }
  }

  function focus(id) {
    const editor = instances.get(id);
    if (editor) {
      editor.editing.view.focus();
      return true;
    }
    return false;
  }

  window.RedmineCKEditor = { replace, destroy, setData, focus, editorFor, instances };
  window.destroyEditor = destroy;

  const originalShowAndScrollTo = window.showAndScrollTo;
  if (originalShowAndScrollTo) {
    window.showAndScrollTo = function(id, focusId) {
      originalShowAndScrollTo(id, null);
      if (focusId && !focus(focusId)) document.getElementById(focusId)?.focus();
    };
  }

  window.addEventListener('beforeunload', event => {
    const dirty = Array.from(instances.values()).some(editor => editor.getData() !== editor._redmineInitialData);
    if (dirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
})(window, document);
