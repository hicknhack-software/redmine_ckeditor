RedmineApp::Application.routes.draw do
  post 'redmine_ckeditor/uploads', to: 'redmine_ckeditor_uploads#create', as: :redmine_ckeditor_uploads
end
