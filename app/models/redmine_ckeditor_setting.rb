# frozen_string_literal: true

class RedmineCkeditorSetting
  LEGACY_TOOLBAR_NAMES = {
    'Source' => 'sourceEditing', 'ShowBlocks' => 'showBlocks', 'Undo' => 'undo',
    'Redo' => 'redo', 'Find' => 'findAndReplace', 'Replace' => 'findAndReplace',
    'Bold' => 'bold', 'Italic' => 'italic', 'Underline' => 'underline',
    'Strike' => 'strikethrough', 'Subscript' => 'subscript', 'Superscript' => 'superscript',
    'NumberedList' => 'numberedList', 'BulletedList' => 'bulletedList',
    'Outdent' => 'outdent', 'Indent' => 'indent', 'Blockquote' => 'blockQuote',
    'JustifyLeft' => 'alignment', 'JustifyCenter' => 'alignment',
    'JustifyRight' => 'alignment', 'JustifyBlock' => 'alignment',
    'Link' => 'link', 'richImage' => 'uploadImage', 'Table' => 'insertTable',
    'HorizontalRule' => 'horizontalLine', 'Format' => 'heading', 'Font' => 'fontFamily',
    'FontSize' => 'fontSize', 'TextColor' => 'fontColor', 'BGColor' => 'fontBackgroundColor'
  }.freeze
  REMOVED_TOOLBAR_ITEMS = %w[Unlink Styles].freeze

  class << self
    def setting = (Setting[:plugin_redmine_ckeditor] || {})

    def toolbar_string = (setting['toolbar'].presence || RedmineCkeditor.default_toolbar)

    def toolbar
      result = []
      seen = {}
      toolbar_string.split(',').each do |raw|
        item = raw.strip
        next if item.blank?

        if item == '/'
          result << '-' unless result.empty? || result.last == '-'
          next
        end

        if %w[| - --].include?(item)
          result << '|' unless result.empty? || result.last == '|'
          next
        end

        item = LEGACY_TOOLBAR_NAMES.fetch(item, item)
        next if REMOVED_TOOLBAR_ITEMS.include?(item) || seen[item]

        seen[item] = true
        result << item
      end
      result.pop if result.last == '|'
      result
    end

    def width = setting['width'].presence

    def height = (setting['height'].to_i.then { |value| value.positive? ? value.clamp(120, 1200) : 400 })

    def ui_color
      value = setting['ui_color'].presence || '#f4f4f4'
      value.match?(/\A#[0-9a-f]{6}\z/i) ? value : '#f4f4f4'
    end

    def show_blocks? = !%w[0 false].include?(setting.fetch('show_blocks', '1').to_s)

    def group_toolbar_items? = %w[1 true].include?(setting['toolbar_can_collapse'].to_s)
  end
end
