import { Group } from "../contracts/Group";
import { id } from ".";

export class GroupModel implements Group {
  public CreationDate;
  public Description;
  public GroupName;
  public LastModifiedDate;
  public Precedence;
  public RoleArn;

  constructor(partial?: Partial<Group>) {
    this.CreationDate = partial?.CreationDate ?? new Date();
    this.Description = partial?.Description ?? undefined;
    this.GroupName = partial?.GroupName ?? id("Group");
    this.LastModifiedDate = partial?.LastModifiedDate ?? new Date();
    this.Precedence = partial?.Precedence ?? undefined;
    this.RoleArn = partial?.RoleArn ?? undefined;
  }
}
