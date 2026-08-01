# frozen_string_literal: true

class MigrateRichUploadsToAttachments < ActiveRecord::Migration[8.1]
  def up
    create_table :redmine_ckeditor_file_migrations, if_not_exists: true do |t|
      t.bigint :rich_file_id, null: false
      t.bigint :attachment_id
      t.string :owner_type
      t.bigint :owner_id
      t.text :source_path
      t.text :attachment_path
      t.text :legacy_urls, limit: 16.megabytes - 1
      t.text :error
      t.timestamps
    end
    add_index :redmine_ckeditor_file_migrations, :rich_file_id,
              unique: true, if_not_exists: true, name: 'idx_ckeditor_file_migrations_rich_id'
    add_index :redmine_ckeditor_file_migrations, :attachment_id,
              if_not_exists: true, name: 'idx_ckeditor_file_migrations_attachment_id'

    create_table :redmine_ckeditor_content_backups, if_not_exists: true do |t|
      t.string :record_type, null: false
      t.bigint :record_id, null: false
      t.string :attribute_name, null: false
      t.text :content, limit: 16.megabytes - 1
      t.timestamps
    end
    add_index :redmine_ckeditor_content_backups, %i[record_type record_id attribute_name],
              unique: true, if_not_exists: true, name: 'idx_ckeditor_content_backups_record'

    result = RedmineCkeditor::LegacyMigration.new.up
    say "Rich migration: #{result.migrated} uploads migrated, #{result.skipped} already migrated, " \
        "#{result.failed} failed, #{result.rewritten} content records rewritten"
  end

  def down
    RedmineCkeditor::LegacyMigration.new.down
    drop_table :redmine_ckeditor_content_backups, if_exists: true
    drop_table :redmine_ckeditor_file_migrations, if_exists: true
  end
end
