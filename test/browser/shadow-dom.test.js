const assert = require('node:assert/strict');
const path = require('node:path');
const { test, before, after, beforeEach, afterEach } = require('node:test');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../..');
const redmine = path.resolve(root, '../..');
let browser;
let page;
let errors;

before(async () => { browser = await chromium.launch(); });
after(async () => { await browser?.close(); });
beforeEach(async () => {
  page = await browser.newPage();
  errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'warning' || message.type() === 'error') errors.push(message.text());
  });
  await page.route('https://redmine.example/', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><meta name="csrf-token" content="test-csrf">
      <style>.hidden { display: none; } .tabular p { clear: left; padding-left: 180px; color: red; }</style>
      <form class="tabular"><p id="outside">Redmine layout</p>
        <textarea id="notes" name="issue[notes]">&lt;p&gt;Initial&lt;/p&gt;</textarea>
        <div class="attachments_form"><input type="file" name="attachments[1][file]"></div>
      </form>`
  }));
  await page.goto('https://redmine.example/');
  await page.addStyleTag({ path: path.join(root, 'assets/javascripts/ckeditor5.css') });
  await page.addStyleTag({ path: path.join(root, 'assets/stylesheets/editor.css') });
  await page.addScriptTag({ path: path.join(redmine, 'app/assets/javascripts/jquery-3.7.1-ui-1.13.3.js') });
  await page.addScriptTag({ path: path.join(redmine, 'app/assets/javascripts/jstoolbar/jstoolbar.js') });
  await page.addScriptTag({ path: path.join(root, 'assets/javascripts/ckeditor5.js') });
  await page.addScriptTag({ path: path.join(root, 'assets/javascripts/integration.js') });
});
afterEach(async () => {
  await page.close();
  assert.deepEqual(errors, []);
});

async function create(options = {}) {
  await page.evaluate(async options => {
    await RedmineCKEditor.replace('notes', {
      licenseKey: 'GPL',
      toolbar: { items: ['bold', 'link', 'findAndReplace', 'sourceEditing'] },
      image: { toolbar: ['imageTextAlternative', 'toggleImageCaption'] },
      ...options
    });
  }, options);
}

test('isolates content styles and synchronizes actual typing into Redmine FormData', async () => {
  await create({ redmineHeight: 350, redmineWidth: '600', redmineUiColor: '#aabbcc' });
  const state = await page.evaluate(() => {
    const editor = RedmineCKEditor.editorFor('notes');
    const editable = editor.ui.getEditableElement();
    const root = editable.getRootNode();
    const overlay = editor.config.get('ui.overlayContainer');
    return {
      mode: root.mode,
      sheets: root.adoptedStyleSheets.length,
      sharedStyles: root.adoptedStyleSheets[0] === overlay.adoptedStyleSheets[0],
      overlayAtBody: overlay.host.parentNode === document.body,
      fieldInForm: document.querySelector('form').elements.namedItem('issue[notes]').id,
      hidden: document.getElementById('notes').hidden,
      clear: getComputedStyle(editable.querySelector('p')).clear,
      padding: getComputedStyle(editable.querySelector('p')).paddingLeft,
      outsideColor: getComputedStyle(document.getElementById('outside')).color,
      height: getComputedStyle(editable).minHeight,
      width: root.host.style.width,
      toolbarColor: getComputedStyle(root.querySelector('.ck-toolbar')).backgroundColor,
      overlayColor: overlay.host.style.getPropertyValue('--ck-color-base-background')
    };
  });
  assert.deepEqual(state, {
    mode: 'open', sheets: 2, sharedStyles: true, overlayAtBody: true,
    fieldInForm: 'notes', hidden: true, clear: 'none', padding: '0px',
    outsideColor: 'rgb(255, 0, 0)', height: '350px', width: '600px',
    toolbarColor: 'rgb(170, 187, 204)', overlayColor: '#aabbcc'
  });

  await page.locator('.ck-editor__editable').fill('Typed in shadow DOM');
  assert.equal(await page.evaluate(() => new FormData(document.querySelector('form')).get('issue[notes]')),
    '<p>Typed in shadow DOM</p>');
  await page.evaluate(() => RedmineCKEditor.focus('notes'));
  assert.equal(await page.evaluate(() => document.activeElement.shadowRoot.activeElement.isContentEditable), true);
});

test('renders and styles floating dialogs in the body-level shadow root', async () => {
  await create();
  await page.getByRole('button', { name: 'Find and replace', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'visible' });
  assert.equal(await page.getByRole('dialog').evaluate(dialog =>
    dialog.getRootNode().host.className), 'redmine-ckeditor-overlay-host');
  assert.notEqual(await page.getByRole('dialog').evaluate(dialog => getComputedStyle(dialog).position), 'static');
});

test('keeps toolbar formatting and source editing connected to the form field', async () => {
  await create();
  const editable = page.locator('.ck-editor__editable');
  await editable.fill('Formatted text');
  await editable.press('ControlOrMeta+a');
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
  assert.equal(await page.evaluate(() => new FormData(document.querySelector('form')).get('issue[notes]')),
    '<p><strong>Formatted text</strong></p>');

  await page.getByRole('button', { name: 'Source', exact: true }).click();
  await page.locator('.ck-source-editing-area textarea').fill('<p>Changed HTML source</p>');
  assert.equal(await page.evaluate(() => new FormData(document.querySelector('form')).get('issue[notes]')),
    '<p>Changed HTML source</p>');
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  assert.equal(await editable.isVisible(), true);
  assert.equal(await page.evaluate(() => RedmineCKEditor.editorFor('notes').getData()),
    '<p>Changed HTML source</p>');
});

test('uses the original Redmine form for image uploads across the shadow boundary', async () => {
  let uploadHeaders;
  await page.route('https://redmine.example/uploads', route => {
    uploadHeaders = route.request().headers();
    return route.fulfill({ json: { id: 12, token: '12.secret', filename: 'test.png', url: '/attachments/download/12/test.png' } });
  });
  await create({ redmineUpload: { uploadUrl: '/uploads' } });
  const uploaded = await page.evaluate(async () => {
    const editor = RedmineCKEditor.editorFor('notes');
    const adapter = editor.plugins.get('FileRepository').createUploadAdapter({
      file: Promise.resolve(new File(['image'], 'test.png', { type: 'image/png' }))
    });
    return adapter.upload();
  });
  assert.equal(uploaded.default, '/attachments/download/12/test.png');
  assert.equal(uploadHeaders['x-csrf-token'], 'test-csrf');
  assert.equal(await page.evaluate(() => new FormData(document.querySelector('form')).get('attachments[ckeditor_12][token]')),
    '12.secret');
});

test('preserves Redmine preview tabs and removes shadow hosts on AJAX replacement and destroy', async () => {
  await create({ redminePreviewUrl: '/preview' });
  await page.locator('.ck-editor__editable').fill('Latest preview');
  await page.locator('.tab-preview').click();
  assert.equal(await page.locator('.redmine-ckeditor-host').isVisible(), false);
  assert.equal(await page.locator('#notes').inputValue(), '<p>Latest preview</p>');
  await page.locator('.tab-edit').click();
  assert.equal(await page.locator('.redmine-ckeditor-host').isVisible(), true);

  await page.evaluate(async () => {
    document.querySelector('.jstBlock').remove();
    const textarea = document.createElement('textarea');
    textarea.id = 'notes';
    textarea.name = 'issue[notes]';
    textarea.value = '<p>Replacement</p>';
    document.querySelector('form').prepend(textarea);
    await RedmineCKEditor.replace('notes', {
      licenseKey: 'GPL', image: { toolbar: ['imageTextAlternative'] }
    });
  });
  assert.equal(await page.locator('.redmine-ckeditor-overlay-host').count(), 1);
  await page.locator('.ck-editor__editable').fill('Last edit before destroy');
  await page.evaluate(() => RedmineCKEditor.destroy('notes'));
  assert.equal(await page.locator('.redmine-ckeditor-host, .redmine-ckeditor-overlay-host').count(), 0);
  assert.equal(await page.locator('#notes').isVisible(), true);
  assert.equal(await page.locator('#notes').inputValue(), '<p>Last edit before destroy</p>');
});
