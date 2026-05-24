-- Remove duplicate editorial post. The "Mateo and Maverick Want the Same Thing"
-- rewrite covers this topic.

PRAGMA foreign_keys = ON;

DELETE FROM blog_posts
WHERE slug = 'two-americas';
