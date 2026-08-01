# frozen_string_literal: true

require_relative '../test_helper'

class RedmineCkeditorSettingTest < ActiveSupport::TestCase
  def test_converts_ckeditor_4_toolbar_names_and_separators
    Setting.stubs(:[]).with(:plugin_redmine_ckeditor).returns(
      'toolbar' => 'Source,ShowBlocks,--,Undo,Redo,-,Bold,Italic,/,JustifyCenter,JustifyRight,richImage,Table'
    )

    assert_equal(
      %w[sourceEditing showBlocks | undo redo | bold italic - alignment uploadImage insertTable],
      RedmineCkeditorSetting.toolbar
    )
  end

  def test_clamps_editor_height
    Setting.stubs(:[]).with(:plugin_redmine_ckeditor).returns('height' => '5000')

    assert_equal 1200, RedmineCkeditorSetting.height
  end

  def test_preserves_supported_legacy_display_settings
    Setting.stubs(:[]).with(:plugin_redmine_ckeditor).returns(
      'width' => '75%', 'ui_color' => '#abcdef', 'show_blocks' => '1', 'toolbar_can_collapse' => '1'
    )

    assert_equal '75%', RedmineCkeditorSetting.width
    assert_equal '#abcdef', RedmineCkeditorSetting.ui_color
    assert_predicate RedmineCkeditorSetting, :show_blocks?
    assert_predicate RedmineCkeditorSetting, :group_toolbar_items?
  end
end
