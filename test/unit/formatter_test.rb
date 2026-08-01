# frozen_string_literal: true

require_relative '../test_helper'

class RedmineCkeditorFormatterTest < ActiveSupport::TestCase
  def format(text)
    RedmineCkeditor::WikiFormatting::Formatter.new(text).to_html
  end

  def test_keeps_ckeditor_html_and_redmine_macros
    html = format('<h2>Title</h2><figure class="image"><img src="/a.png"></figure>{{toc}}')

    assert_includes html, '<h2>Title</h2>'
    assert_includes html, '<figure class="image"><img src="/a.png"></figure>'
    assert_includes html, '{{toc}}'
  end

  def test_sanitizes_scripts_and_unsafe_protocols
    html = format('<script>alert(1)</script><a href="javascript:alert(2)">link</a>')

    refute_includes html, '<script'
    refute_includes html, 'javascript:'
    assert_includes html, '<a>link</a>'
  end

  def test_uses_the_file_response_for_existing_attachment_images
    html = format('<figure class="image"><img src="/attachments/42/test.png"></figure>')

    assert_includes html, '<img src="/attachments/download/42/test.png">'
  end

  def test_does_not_change_attachment_preview_links
    html = format('<a href="/attachments/42/test.png">test.png</a>')

    assert_includes html, '<a href="/attachments/42/test.png">test.png</a>'
  end

  def test_does_not_auto_link_urls_inside_srcset
    source = <<~HTML.strip
      <img style="aspect-ratio:600/386;" src="https://ckeditor.com/tajmahal.jpg" alt="Taj Mahal illustration." srcset="https://ckeditor.com/tajmahal.jpg, https://ckeditor.com/tajmahal_2x.jpg 2x" sizes="100vw" width="600" height="386">
    HTML

    html = format(source)

    assert_includes html, 'srcset="https://ckeditor.com/tajmahal.jpg, https://ckeditor.com/tajmahal_2x.jpg 2x"'
    assert_includes html, 'sizes="100vw"'
    refute_match(/srcset="[^"]*<a\b/, html)
  end

  def test_auto_links_urls_in_visible_text
    html = format('<p>See https://example.test/docs for details.</p>')

    assert_includes html, '<a class="external" href="https://example.test/docs">https://example.test/docs</a>'
  end

  def test_preserves_preformatted_code
    source = '<pre><code class="ruby">puts &quot;hello&quot;</code></pre>'

    assert_equal '<pre><code class="ruby">puts "hello"</code></pre>', format(source)
  end

  def test_sanitizes_preformatted_html_without_auto_linking_its_text
    html = format('<pre><code>https://example.test</code><script>alert(1)</script></pre>')

    assert_equal '<pre><code>https://example.test</code>alert(1)</pre>', html
  end

  def test_sanitizes_html_inside_unknown_macro_syntax
    html = format('{{unknown(<script>alert(1)</script>)}}')

    assert_equal '{{unknown(alert(1))}}', html
  end
end
