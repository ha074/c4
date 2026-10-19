import { avatarColors, avatarInitial } from '../lib/avatar';

export function Avatar({ nickname, isAdmin = false, large = false }: { nickname: string; isAdmin?: boolean; large?: boolean }) {
  return (
    <span className={large ? 'avatar avatar--lg' : 'avatar'} style={avatarColors(nickname, isAdmin)} aria-hidden="true">
      {avatarInitial(nickname)}
    </span>
  );
}
