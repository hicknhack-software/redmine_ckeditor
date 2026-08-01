# frozen_string_literal: true

require 'cgi'
require 'json'
require 'pathname'
require 'uri'

module RedmineCkeditor
  # Moves uploads created by the former Rich/Paperclip dependency into native
  # Redmine attachments. Original Rich rows/files remain untouched, and every
  # rewritten database value is backed up for a complete plugin-migration rollback.
  class LegacyMigration
    CONTENT_TARGETS = {
      'Issue' => :description,
      'Journal' => :notes,
      'WikiContent' => :text,
      'WikiContentVersion' => :text,
      'Message' => :content,
      'News' => :description,
      'Comment' => :content,
      'Document' => :description,
      'Project' => :description,
      'Version' => :description,
      'CustomValue' => :value,
      'CustomField' => :description,
      'Tracker' => :description,
      'Setting' => :value
    }.freeze

    class LegacyFile < ApplicationRecord
      self.table_name = 'rich_rich_files'
    end

    class FileMigration < ApplicationRecord
      self.table_name = 'redmine_ckeditor_file_migrations'
    end

    class ContentBackup < ApplicationRecord
      self.table_name = 'redmine_ckeditor_content_backups'
    end

    Result = Data.define(:migrated, :skipped, :failed, :rewritten)

    def up
      reset_models
      return Result.new(migrated: 0, skipped: 0, failed: 0, rewritten: 0) unless legacy_table?

      counters = {migrated: 0, skipped: 0, failed: 0}
      LegacyFile.find_each do |legacy|
        migrate_file(legacy, counters)
      end
      Result.new(**counters, rewritten: rewrite_content)
    end

    def down
      reset_models
      restore_content
      return unless ActiveRecord::Base.connection.data_source_exists?(FileMigration.table_name)

      FileMigration.where.not(attachment_id: nil).find_each do |migration|
        Attachment.find_by(id: migration.attachment_id)&.destroy
      end
      FileMigration.delete_all
    end

    def retry_failed
      up
    end

    private

    def legacy_table?
      ActiveRecord::Base.connection.data_source_exists?(LegacyFile.table_name)
    end

    def reset_models
      [LegacyFile, FileMigration, ContentBackup].each(&:reset_column_information)
    end

    def migrate_file(legacy, counters)
      if legacy.simplified_type == 'folder'
        counters[:skipped] += 1
        return
      end

      migration = FileMigration.find_or_initialize_by(rich_file_id: legacy.id)
      if migration.attachment_id.present? && Attachment.exists?(migration.attachment_id)
        counters[:skipped] += 1
        return
      end

      source = source_path(legacy)
      raise "original upload not found for #{legacy.rich_file_file_name.inspect}" unless source

      attachment = create_attachment(legacy, source)
      migration.update!(
        attachment_id: attachment.id,
        owner_type: legacy.owner_type,
        owner_id: legacy.owner_id,
        source_path: source.to_s,
        attachment_path: attachment_url(attachment),
        legacy_urls: legacy_urls(legacy).to_json,
        error: nil
      )
      counters[:migrated] += 1
    rescue StandardError => e
      attachment&.destroy
      migration ||= FileMigration.find_or_initialize_by(rich_file_id: legacy.id)
      migration.error = "#{e.class}: #{e.message}"
      migration.updated_at = Time.current
      migration.save(validate: false)
      counters[:failed] += 1
      Rails.logger.error("redmine_ckeditor legacy upload #{legacy.id}: #{e.class}: #{e.message}")
    end

    def create_attachment(legacy, source)
      attachment = Attachment.new(author: migration_author, container: owner_for(legacy))
      File.open(source, 'rb') do |file|
        file.define_singleton_method(:original_filename) { legacy.rich_file_file_name }
        file.define_singleton_method(:content_type) { legacy.rich_file_content_type }
        attachment.file = file
        attachment.save!
      end
      if legacy.created_at && attachment.has_attribute?(:created_on)
        attachment.update_columns(created_on: legacy.created_at)
      end
      attachment
    end

    def migration_author
      @migration_author ||= User.active.where(admin: true).first || User.active.first || User.anonymous
    end

    def owner_for(legacy)
      klass = legacy.owner_type.to_s.safe_constantize
      return unless klass&.<(ActiveRecord::Base)

      owner = klass.find_by(id: legacy.owner_id)
      owner if owner.respond_to?(:attachments)
    rescue NameError
      nil
    end

    def source_path(legacy)
      candidates = uri_cache_values(legacy).filter_map { |url| public_path_for(url) }
      partition = format('%09d', legacy.id).scan(/.{3}/).join('/')
      %w[rich_files rich_file].each do |attachment_name|
        candidates << Rails.public_path.join(
          'system', 'rich', 'rich_files', attachment_name, partition, 'original', legacy.rich_file_file_name.to_s
        )
      end

      candidates.find(&:file?) || paperclip_directory_candidates(partition).find(&:file?)
    end

    def paperclip_directory_candidates(partition)
      %w[rich_files rich_file].flat_map do |attachment_name|
        directory = Rails.public_path.join('system', 'rich', 'rich_files', attachment_name, partition, 'original')
        directory.directory? ? directory.children.select(&:file?) : []
      end
    end

    def public_path_for(url)
      value = CGI.unescapeHTML(url.to_s)
      path = URI.parse(value).path
      return if path.blank?

      system_index = path.index('/system/rich/')
      path = path[system_index..] if system_index
      candidate = Rails.public_path.join(path.delete_prefix('/')).cleanpath
      public_root = Rails.public_path.cleanpath.to_s
      candidate if candidate.to_s.start_with?("#{public_root}#{File::SEPARATOR}")
    rescue URI::InvalidURIError
      nil
    end

    def uri_cache_values(legacy)
      JSON.parse(legacy.uri_cache.presence || '{}').values.grep(String)
    rescue JSON::ParserError
      []
    end

    def legacy_urls(legacy)
      urls = uri_cache_values(legacy)
      partition = format('%09d', legacy.id).scan(/.{3}/).join('/')
      filename = legacy.rich_file_file_name.to_s
      escaped_filename = ERB::Util.url_encode(filename).gsub('+', '%20')
      %w[rich_files rich_file].each do |attachment_name|
        [filename, escaped_filename].uniq.each do |name|
          urls << "/system/rich/rich_files/#{attachment_name}/#{partition}/original/#{name}"
          urls << "/rich/rich_files/#{attachment_name}/#{partition}/original/#{name}"
        end
      end
      urls.compact.uniq
    end

    def attachment_url(attachment)
      Rails.application.routes.url_helpers.download_named_attachment_path(
        id: attachment.id,
        filename: attachment.filename
      )
    end

    def rewrite_content
      path_map = migration_path_map
      return 0 if path_map.empty?

      rewritten = 0
      CONTENT_TARGETS.each do |class_name, attribute|
        klass = class_name.safe_constantize
        next unless klass&.<(ActiveRecord::Base)

        klass.find_each do |record|
          original = read_content(record, attribute)
          next unless original.is_a?(String) && original.include?('rich_file')

          updated = rewrite_urls(original, path_map)
          next if updated == original

          backup_content(record, attribute, original)
          write_content(record, attribute, updated)
          rewritten += 1
        end
      end
      rewritten
    end

    def migration_path_map
      FileMigration.where.not(attachment_id: nil).each_with_object({}) do |migration, map|
        Array(JSON.parse(migration.legacy_urls.presence || '[]')).each do |url|
          path = normalized_uri_path(url)
          map[path] = migration.attachment_path if path
          if (index = path&.index('/system/rich/'))
            map[path[index..]] = migration.attachment_path
          end
        end
      rescue JSON::ParserError
        next
      end
    end

    def rewrite_urls(content, path_map)
      content.gsub(/(?<prefix>\b(?:src|href)\s*=\s*["'])(?<url>[^"']+)(?<suffix>["'])/i) do
        match = Regexp.last_match
        replacement = path_map[normalized_uri_path(match[:url])]
        replacement ? "#{match[:prefix]}#{replacement}#{match[:suffix]}" : match[0]
      end
    end

    def normalized_uri_path(url)
      path = URI.parse(CGI.unescapeHTML(url.to_s)).path
      return if path.blank?

      if (index = path.index('/system/rich/'))
        path[index..]
      elsif (index = path.index('/rich/rich_files/'))
        path[index..]
      else
        path
      end
    rescue URI::InvalidURIError
      nil
    end

    def backup_content(record, attribute, original)
      ContentBackup.find_or_create_by!(
        record_type: record.class.name,
        record_id: record.id,
        attribute_name: attribute.to_s
      ) { |backup| backup.content = original }
    end

    def read_content(record, attribute)
      record.public_send(attribute)
    rescue StandardError => e
      Rails.logger.warn("redmine_ckeditor could not read #{record.class}##{record.id}.#{attribute}: #{e.message}")
      nil
    end

    def write_content(record, attribute, value)
      if record.is_a?(WikiContentVersion)
        record.text = value
        record.update_columns(data: record.data, compression: record.compression)
      else
        record.update_columns(attribute => value)
      end
    end

    def restore_content
      return unless ActiveRecord::Base.connection.data_source_exists?(ContentBackup.table_name)

      ContentBackup.find_each do |backup|
        klass = backup.record_type.safe_constantize
        record = klass&.<(ActiveRecord::Base) && klass.find_by(id: backup.record_id)
        write_content(record, backup.attribute_name, backup.content) if record
      end
      ContentBackup.delete_all
    end
  end
end
