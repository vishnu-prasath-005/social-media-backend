import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';

const USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  bannerUrl: true,
  bio: true,
  isVerified: true,
  createdAt: true,
  _count: { select: { followers: true, following: true, posts: { where: { isDeleted: false } } } },
} as const;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findById(id: string, viewerId?: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
    if (!user) throw new NotFoundException('User not found');
    return this.withRelationship(user, viewerId);
  }

  async findByUsername(username: string, viewerId?: string) {
    const user = await this.prisma.user.findUnique({ where: { username }, select: USER_SELECT });
    if (!user) throw new NotFoundException('User not found');
    return this.withRelationship(user, viewerId);
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.update({ where: { id }, data: dto, select: USER_SELECT });
    return this.withRelationship(user, id);
  }

  async deactivate(id: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { passwordHash: true },
    });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    await this.prisma.user.update({ where: { id }, data: { isActive: false } });
  }

  private async withRelationship(user: any, viewerId?: string) {
    const { _count, ...profile } = user;
    if (!viewerId || viewerId === user.id) {
      return {
        ...profile,
        postCount: _count.posts,
        followerCount: _count.followers,
        followingCount: _count.following,
        ...(viewerId ? { isFollowing: false, isFollowedBy: false } : {}),
      };
    }
    const [isFollowing, isFollowedBy] = await Promise.all([
      this.prisma.follow.findUnique({ where: { followerId_followingId: { followerId: viewerId, followingId: user.id } }, select: { followerId: true } }),
      this.prisma.follow.findUnique({ where: { followerId_followingId: { followerId: user.id, followingId: viewerId } }, select: { followerId: true } }),
    ]);
    return {
      ...profile,
      postCount: _count.posts,
      followerCount: _count.followers,
      followingCount: _count.following,
      isFollowing: !!isFollowing,
      isFollowedBy: !!isFollowedBy,
    };
  }
}
