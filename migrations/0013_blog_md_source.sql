-- Add Markdown source column to blog_posts.
-- body_md stores the raw Markdown authored in the admin editor.
-- body_html continues to hold the rendered HTML served to readers.
-- Null means the post was authored in raw HTML (legacy or custom).

ALTER TABLE blog_posts ADD COLUMN body_md TEXT;
