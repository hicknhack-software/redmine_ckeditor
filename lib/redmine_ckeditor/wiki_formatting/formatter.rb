# frozen_string_literal: true

module RedmineCkeditor::WikiFormatting
  class Formatter
    include Redmine::WikiFormatting::LinksHelper

    def initialize(text, _options = {})
      @text = text.to_s
    end

    def to_html(*)
      preserved = []
      text = @text.gsub(/<pre\b[^>]*>.*?<\/pre>/mi) do
        preserve(sanitize(Regexp.last_match(0)), preserved)
      end

      text = sanitize(text)
      text = auto_link_text_nodes(text)
      text = normalize_attachment_image_urls(text)

      preserved.each.with_index(1) { |content, index| text.gsub!("____redmine_ckeditor_#{index}____", content) }
      text
    end

    private

    def sanitize(text)
      ActionController::Base.helpers.sanitize(
        text,
        tags: RedmineCkeditor.allowed_tags,
        attributes: RedmineCkeditor.allowed_attributes,
        protocols: RedmineCkeditor.allowed_protocols
      )
    end

    def preserve(content, preserved)
      preserved << content
      "____redmine_ckeditor_#{preserved.length}____"
    end

    # LinksHelper#auto_link! operates on an HTML string and can mistake a URL
    # after a comma in an attribute (notably srcset) for visible text. Run it
    # only against parsed text nodes and leave every element attribute intact.
    def auto_link_text_nodes(text)
      fragment = Loofah.html5_fragment(text)

      fragment.xpath('.//text()[not(ancestor::a)]').each do |node|
        escaped_text = ERB::Util.html_escape(node.text)
        linked_text = escaped_text.dup
        auto_link!(linked_text)
        next if linked_text == escaped_text

        node.replace(Loofah.html5_fragment(linked_text))
      end

      fragment.to_s
    end

    # Redmine's named attachment route renders the attachment preview page.
    # Images need the download route, which returns the actual file response.
    # Normalize content produced by earlier plugin versions while it is rendered;
    # the browser integration performs the same repair when that content is edited.
    def normalize_attachment_image_urls(text)
      fragment = Loofah.html5_fragment(text)
      relative_root = Redmine::Utils.relative_url_root.to_s
      attachment_roots = ["#{relative_root}/attachments/", '/attachments/'].uniq

      fragment.css('img[src]').each do |image|
        src = image['src']
        attachment_root = attachment_roots.find { |root| src.start_with?(root) }
        next unless attachment_root
        next if src.start_with?("#{attachment_root}download/")

        image['src'] = src.sub(
          /\A#{Regexp.escape(attachment_root)}(?=\d+(?:\/|\z))/,
          "#{attachment_root}download/"
        )
      end

      fragment.to_s
    end
  end
end
