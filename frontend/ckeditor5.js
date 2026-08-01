import {
  AccessibilityHelp,
  Alignment,
  Autoformat,
  AutoImage,
  AutoLink,
  BlockQuote,
  Bold,
  Code,
  CodeBlock,
  Essentials,
  FindAndReplace,
  FontBackgroundColor,
  FontColor,
  FontFamily,
  FontSize,
  GeneralHtmlSupport,
  Heading,
  Highlight,
  HorizontalLine,
  Image,
  ImageCaption,
  ImageInsert,
  ImageResize,
  ImageStyle,
  ImageToolbar,
  ImageUpload,
  Indent,
  IndentBlock,
  Italic,
  Link,
  LinkImage,
  List,
  ListProperties,
  MediaEmbed,
  Paragraph,
  PasteFromOffice,
  RemoveFormat,
  ShowBlocks,
  SourceEditing,
  SpecialCharacters,
  SpecialCharactersEssentials,
  Style,
  Strikethrough,
  Subscript,
  Superscript,
  Table,
  TableCaption,
  TableCellProperties,
  TableColumnResize,
  TableProperties,
  TableToolbar,
  TodoList,
  Underline
} from 'ckeditor5';
import { ClassicEditor } from 'ckeditor5';
import 'ckeditor5/ckeditor5.css';

class RedmineUploadAdapter {
  constructor(loader, editor) {
    this.loader = loader;
    this.editor = editor;
    this.controller = new AbortController();
  }

  async upload() {
    const file = await this.loader.file;
    const uploadUrl = this.editor.config.get('redmineUpload.uploadUrl');
    const form = this.editor.sourceElement?.closest('form');
    const attachmentInput = form?.querySelector('.attachments_form input[type="file"][name^="attachments["]');

    if (!uploadUrl || !form || !attachmentInput) {
      throw new Error('Uploads are not available in this form.');
    }

    const body = new FormData();
    body.append('upload', file, file.name);

    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    const response = await fetch(uploadUrl, {
      method: 'POST',
      body,
      credentials: 'same-origin',
      // Keep this a browser/session request. Redmine deliberately ignores the
      // session for JSON API requests and would otherwise see an anonymous user.
      headers: csrfToken ? { 'X-CSRF-Token': csrfToken, Accept: 'text/plain' } : { Accept: 'text/plain' },
      signal: this.controller.signal
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.url || !payload.token) {
      throw new Error(payload.error || `Upload failed (${response.status}).`);
    }

    this.addAttachmentFields(form, payload);
    return { default: payload.url };
  }

  abort() {
    this.controller.abort();
  }

  addAttachmentFields(form, payload) {
    if (form.querySelector(`[data-ckeditor-attachment-id="${payload.id}"]`)) return;

    const key = `ckeditor_${payload.id}`;
    const fields = document.createElement('span');
    fields.hidden = true;
    fields.dataset.ckeditorAttachmentId = payload.id;
    fields.innerHTML =
      `<input type="hidden" name="attachments[${key}][token]">` +
      `<input type="hidden" name="attachments[${key}][filename]">`;
    fields.children[0].value = payload.token;
    fields.children[1].value = payload.filename;
    form.append(fields);
  }
}

function RedmineUpload(editor) {
  editor.plugins.get('FileRepository').createUploadAdapter = loader => new RedmineUploadAdapter(loader, editor);
}

window.RedmineCKEditor5 = {
  ClassicEditor,
  RedmineUpload,
  plugins: [
    AccessibilityHelp,
    Alignment,
    Autoformat,
    AutoImage,
    AutoLink,
    BlockQuote,
    Bold,
    Code,
    CodeBlock,
    Essentials,
    FindAndReplace,
    FontBackgroundColor,
    FontColor,
    FontFamily,
    FontSize,
    GeneralHtmlSupport,
    Heading,
    Highlight,
    HorizontalLine,
    Image,
    ImageCaption,
    ImageInsert,
    ImageResize,
    ImageStyle,
    ImageToolbar,
    ImageUpload,
    Indent,
    IndentBlock,
    Italic,
    Link,
    LinkImage,
    List,
    ListProperties,
    MediaEmbed,
    Paragraph,
    PasteFromOffice,
    RemoveFormat,
    ShowBlocks,
    SourceEditing,
    SpecialCharacters,
    SpecialCharactersEssentials,
    Style,
    Strikethrough,
    Subscript,
    Superscript,
    Table,
    TableCaption,
    TableCellProperties,
    TableColumnResize,
    TableProperties,
    TableToolbar,
    TodoList,
    Underline
  ]
};
