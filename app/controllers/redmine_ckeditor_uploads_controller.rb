# frozen_string_literal: true

class RedmineCkeditorUploadsController < ApplicationController
  ALLOWED_IMAGE_TYPES = %w[
    image/avif image/bmp image/gif image/jpeg image/png image/tiff image/webp
  ].freeze

  before_action :require_login
  before_action :authorize_attachment_upload

  def create
    upload = params[:upload]
    unless valid_image?(upload)
      render json: {error: l(:ckeditor_image_only)}, status: :unprocessable_entity
      return
    end

    attachment = Attachment.new(file: upload, author: User.current)
    if attachment.save
      render json: {
        id: attachment.id,
        token: attachment.token,
        filename: attachment.filename,
        url: download_named_attachment_path(id: attachment.id, filename: attachment.filename)
      }, status: :created
    else
      render json: {error: attachment.errors.full_messages.join(', ')}, status: :unprocessable_entity
    end
  end

  private

  def authorize_attachment_upload = authorize_global('attachments', 'upload')

  def valid_image?(upload)
    upload.respond_to?(:content_type) &&
      ALLOWED_IMAGE_TYPES.include?(upload.content_type.to_s.downcase) &&
      upload.original_filename.to_s.match?(/\.(?:avif|bmp|gif|jpe?g|png|tiff?|webp)\z/i)
  end
end
