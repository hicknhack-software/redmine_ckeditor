# frozen_string_literal: true

require_relative '../test_helper'

class RedmineCkeditorLegacyMigrationTest < ActiveSupport::TestCase
  def test_uses_the_file_response_for_migrated_attachments
    migration = RedmineCkeditor::LegacyMigration.new
    attachment = stub(id: 42, filename: 'test image.png')

    assert_equal(
      '/attachments/download/42/test%20image.png',
      migration.send(:attachment_url, attachment)
    )
  end

  def test_rewrites_relative_and_absolute_rich_urls
    migration = RedmineCkeditor::LegacyMigration.new
    path = '/system/rich/rich_files/rich_files/000/000/001/original/test.png'
    content = <<~HTML.strip
      <img src="https://old.example.test/redmine#{path}"><a href='#{path}'>file</a>
    HTML

    rewritten = migration.send(:rewrite_urls, content, path => '/attachments/42/test.png')

    assert_equal(
      '<img src="/attachments/42/test.png"><a href=\'/attachments/42/test.png\'>file</a>',
      rewritten
    )
  end

  def test_does_not_rewrite_plain_text_that_only_looks_like_a_url
    migration = RedmineCkeditor::LegacyMigration.new
    path = '/system/rich/rich_files/rich_files/000/000/001/original/test.png'

    assert_equal path, migration.send(:rewrite_urls, path, path => '/attachments/42/test.png')
  end
end
