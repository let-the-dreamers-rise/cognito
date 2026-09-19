import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/** The web document shell. Applies to the static export only, never to native. */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang='en'>
      <head>
        <meta charSet='utf-8' />
        <meta httpEquiv='X-UA-Compatible' content='IE=edge' />
        <meta
          name='viewport'
          content='width=device-width, initial-scale=1, shrink-to-fit=no'
        />
        <meta
          name='description'
          content='Knowing today was an ordinary day for someone who lives alone.'
        />
        <title>Sab Theek</title>
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: `body { background-color: #FBF7F0; }` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
