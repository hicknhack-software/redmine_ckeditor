# frozen_string_literal: true

namespace :redmine_ckeditor do
  desc 'Retry and report migration of legacy Rich uploads/content'
  task migrate_legacy: :environment do
    result = RedmineCkeditor::LegacyMigration.new.retry_failed
    puts "Migrated: #{result.migrated}"
    puts "Already migrated: #{result.skipped}"
    puts "Failed: #{result.failed}"
    puts "Content records rewritten: #{result.rewritten}"

    if result.failed.positive?
      puts 'Failures:'
      RedmineCkeditor::LegacyMigration::FileMigration.where.not(error: nil).find_each do |failure|
        puts "  Rich file ##{failure.rich_file_id}: #{failure.error}"
      end
      abort 'Some legacy uploads could not be migrated; original data was left intact.'
    end
  end
end
