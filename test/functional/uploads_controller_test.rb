# frozen_string_literal: true

require_relative '../test_helper'

class RedmineCkeditorUploadsControllerTest < Redmine::ControllerTest
  tests RedmineCkeditorUploadsController

  def setup
    User.current = nil
    @request.session[:user_id] = 1
    set_tmp_attachments_directory
  end

  def test_creates_a_native_unattached_redmine_attachment
    count = Attachment.count
    upload = uploaded_test_file('2010/12/101223161450_testfile_2.png', 'image/png')
    post :create, params: {upload: upload}

    assert_response :created, response.body
    assert_equal count + 1, Attachment.count
    payload = JSON.parse(response.body)
    attachment = Attachment.find(payload.fetch('id'))
    assert_equal attachment.token, payload.fetch('token')
    assert_equal '101223161450_testfile_2.png', payload.fetch('filename')
    assert_equal "/attachments/download/#{attachment.id}/101223161450_testfile_2.png", payload.fetch('url')
    assert_nil attachment.container
  ensure
    attachment&.destroy
  end

  def test_rejects_svg_uploads
    path = File.expand_path('../fixtures/files/testfile.svg', __dir__)
    file = uploaded_test_file(path, 'image/svg+xml')

    assert_no_difference 'Attachment.count' do
      post :create, params: {upload: file}
    end
    assert_response :unprocessable_entity
  end
end
